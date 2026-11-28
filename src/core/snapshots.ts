import { countWords, findSceneContext, isSceneLocked, newId } from './manuscript';
import type { BookProject, SceneSnapshot } from './types';

export interface DiffToken {
  type: 'equal' | 'insert' | 'delete';
  value: string;
}

export interface DiffResult {
  tokens: DiffToken[];
  addedWords: number;
  removedWords: number;
}

export function createSnapshotForScene(
  project: BookProject,
  sceneId: string,
  label?: string,
): { project: BookProject; snapshot?: SceneSnapshot } {
  const next = structuredClone(project);
  const ctx = findSceneContext(next, sceneId);
  if (!ctx) return { project: next };

  const scene = next.parts[ctx.partIndex].chapters[ctx.chapterIndex].scenes[ctx.sceneIndex];
  const now = new Date();
  const snapshot: SceneSnapshot = {
    id: newId('snap'),
    createdAt: now.toISOString(),
    label:
      label?.trim() ||
      `Checkpoint (${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})`,
    content: scene.content,
    wordCount: countWords(scene.content),
  };

  scene.snapshots.unshift(snapshot);
  return { project: next, snapshot };
}

export function restoreSnapshotToScene(
  project: BookProject,
  sceneId: string,
  snapshotId: string,
): BookProject {
  if (isSceneLocked(project, sceneId).locked) return project;
  const next = structuredClone(project);
  const ctx = findSceneContext(next, sceneId);
  if (!ctx) return next;

  const scene = next.parts[ctx.partIndex].chapters[ctx.chapterIndex].scenes[ctx.sceneIndex];
  const snap = scene.snapshots.find((item) => item.id === snapshotId);
  if (!snap) return next;

  // Save current state as a safety snapshot before restoring
  scene.snapshots.unshift({
    id: newId('snap'),
    createdAt: new Date().toISOString(),
    label: 'Auto-backup before restore',
    content: scene.content,
    wordCount: countWords(scene.content),
  });
  scene.content = snap.content;
  scene.updatedAt = new Date().toISOString();
  return next;
}

function tokenizePreservingWhitespace(text: string): string[] {
  const matched = text.match(/\S+|\s+/g);
  return matched ?? [];
}

function isWordToken(token: string): boolean {
  return /\S/.test(token);
}

/**
 * Deterministic LCS word/whitespace diff bounded for responsive UI editing.
 */
export function computeWordDiff(beforeText: string, afterText: string): DiffResult {
  if (beforeText === afterText) {
    return {
      tokens: beforeText ? [{ type: 'equal', value: beforeText }] : [],
      addedWords: 0,
      removedWords: 0,
    };
  }

  let a = tokenizePreservingWhitespace(beforeText);
  let b = tokenizePreservingWhitespace(afterText);

  // For exceptionally long chapters (> 1800 tokens), switch to line/paragraph granularity
  if (a.length * b.length > 1_800_000) {
    a = beforeText.split(/(\r?\n)/);
    b = afterText.split(/(\r?\n)/);
  }

  // Trim shared prefix and suffix for O(N) fast-path on localized edits
  let prefix = 0;
  while (prefix < a.length && prefix < b.length && a[prefix] === b[prefix]) {
    prefix++;
  }

  let suffix = 0;
  while (
    suffix < a.length - prefix &&
    suffix < b.length - prefix &&
    a[a.length - 1 - suffix] === b[b.length - 1 - suffix]
  ) {
    suffix++;
  }

  const midA = a.slice(prefix, a.length - suffix);
  const midB = b.slice(prefix, b.length - suffix);

  const m = midA.length;
  const n = midB.length;
  const rawTokens: DiffToken[] = [];

  if (prefix > 0) {
    rawTokens.push({ type: 'equal', value: a.slice(0, prefix).join('') });
  }

  if (m === 0 && n > 0) {
    rawTokens.push({ type: 'insert', value: midB.join('') });
  } else if (n === 0 && m > 0) {
    rawTokens.push({ type: 'delete', value: midA.join('') });
  } else if (m > 0 && n > 0) {
    const dp: Uint32Array[] = Array.from({ length: m + 1 }, () => new Uint32Array(n + 1));
    for (let i = m - 1; i >= 0; i--) {
      const row = dp[i];
      const nextRow = dp[i + 1];
      for (let j = n - 1; j >= 0; j--) {
        if (midA[i] === midB[j]) {
          row[j] = nextRow[j + 1] + 1;
        } else {
          row[j] = nextRow[j] >= row[j + 1] ? nextRow[j] : row[j + 1];
        }
      }
    }

    let i = 0;
    let j = 0;
    while (i < m && j < n) {
      if (midA[i] === midB[j]) {
        rawTokens.push({ type: 'equal', value: midA[i] });
        i++;
        j++;
      } else if (dp[i + 1][j] >= dp[i][j + 1]) {
        rawTokens.push({ type: 'delete', value: midA[i] });
        i++;
      } else {
        rawTokens.push({ type: 'insert', value: midB[j] });
        j++;
      }
    }
    while (i < m) {
      rawTokens.push({ type: 'delete', value: midA[i++] });
    }
    while (j < n) {
      rawTokens.push({ type: 'insert', value: midB[j++] });
    }
  }

  if (suffix > 0) {
    rawTokens.push({ type: 'equal', value: a.slice(a.length - suffix).join('') });
  }

  // Coalesce adjacent tokens of the same type
  const merged: DiffToken[] = [];
  let addedWords = 0;
  let removedWords = 0;

  for (const tok of rawTokens) {
    if (!tok.value) continue;
    if (tok.type === 'insert') {
      addedWords += tokenizePreservingWhitespace(tok.value).filter(isWordToken).length;
    } else if (tok.type === 'delete') {
      removedWords += tokenizePreservingWhitespace(tok.value).filter(isWordToken).length;
    }

    const last = merged[merged.length - 1];
    if (last && last.type === tok.type) {
      last.value += tok.value;
    } else {
      merged.push({ ...tok });
    }
  }

  return { tokens: merged, addedWords, removedWords };
}
