import type { AppActions, EditorSubMode, TypesetSubTab } from '../core/app-context';
import { isTauriRuntime } from '../core/bridge';
import type { StudioViewId, ToolTier } from '../core/types';
import { el, icon, svgEl } from './dom';

export type CourseTrackId = 'manuscript' | 'story-graph' | 'cover-studio' | 'craft-publishing';
export type CoursePlatform = 'both' | 'web' | 'desktop';

export const COURSE_PLATFORM_OPTIONS: ReadonlyArray<{ id: 'all' | 'web' | 'desktop'; label: string }> = [
  { id: 'all', label: 'All Editions' },
  { id: 'web', label: 'Website Edition' },
  { id: 'desktop', label: 'Desktop App' },
];

export const COURSE_TRACK_OPTIONS: ReadonlyArray<{ id: 'all' | CourseTrackId; label: string }> = [
  { id: 'all', label: 'All Tracks' },
  { id: 'manuscript', label: 'Manuscript' },
  { id: 'story-graph', label: 'Story Graph' },
  { id: 'cover-studio', label: 'Cover Studio' },
  { id: 'craft-publishing', label: 'Craft & Press' },
];

export interface CourseCheckpoint {
  question: string;
  options: readonly string[];
  correctIndex: number;
  explanation: string;
}

export interface CourseLesson {
  id: string;
  title: string;
  durationMin: number;
  instruction: string;
  objective: string;
  concepts: readonly string[];
  steps: readonly string[];
  example: {
    heading: string;
    body: string;
  };
  proTip: string;
  checkpoint: CourseCheckpoint;
  actionLabel: string;
  minTier: ToolTier;
  targetView: StudioViewId;
  targetTypesetTab?: TypesetSubTab;
  targetEditorSubMode?: EditorSubMode;
  targetSelector?: string;
}

export interface CourseModule {
  id: string;
  number: number;
  track?: CourseTrackId;
  platform?: CoursePlatform;
  title: string;
  summary: string;
  audience: string;
  lessons: readonly CourseLesson[];
}

const MODULE_TRACK_MAP: Partial<Record<string, CourseTrackId>> = {
  'mod-setup': 'manuscript',
  'mod-draft': 'manuscript',
  'mod-proof': 'manuscript',
  'mod-plot': 'story-graph',
  'mod-series-world': 'story-graph',
  'mod-cover': 'cover-studio',
  'mod-typeset': 'craft-publishing',
  'mod-publish': 'craft-publishing',
  'mod-security': 'craft-publishing',
  'mod-teams': 'craft-publishing',
  'mod-desktop': 'manuscript',
  'mod-scene-craft': 'craft-publishing',
  'mod-dialogue': 'craft-publishing',
  'mod-prepress': 'cover-studio',
  'mod-web-browser': 'manuscript',
  'mod-desktop-tabs': 'manuscript',
  'mod-desktop-os': 'craft-publishing',
};

const MODULE_PLATFORM_MAP: Partial<Record<string, CoursePlatform>> = {
  'mod-desktop': 'desktop',
  'mod-cs-deep-2': 'desktop',
  'mod-web-browser': 'web',
  'mod-desktop-tabs': 'desktop',
  'mod-desktop-os': 'desktop',
};

export function getModuleTrack(mod: CourseModule): CourseTrackId {
  return mod.track ?? MODULE_TRACK_MAP[mod.id] ?? 'craft-publishing';
}

export function getModulePlatform(mod: CourseModule): CoursePlatform {
  return mod.platform ?? MODULE_PLATFORM_MAP[mod.id] ?? 'both';
}

const COURSE_PROGRESS_KEY = 'quillvibe.courseProgress.v1';
let memoryCompletedLessons = new Set<string>();

export const COURSE_MODULES: readonly CourseModule[] = [
  {
    id: 'mod-setup',
    number: 1,
    title: 'Desk Setup, Workspace Layouts & Multi-Window Books',
    summary:
      'Set up your book identity, switch between Focused, Editorial, and Full Studio layouts, resize columns, and work across parallel windows or tabs.',
    audience: 'First-time authors setting up their writing desk',
    lessons: [
      {
        id: 'm1-title',
        title: 'Create Your Book Identity, Pen Name & Window Title',
        durationMin: 4,
        instruction:
          'Name your working manuscript in the top-left bar, configure your Author Key and pen name in Library, and pick how browser tabs or desktop windows display your title.',
        objective: 'Establish a clean book project with reliable local saving and personalized window labeling.',
        concepts: [
          'Quillvibe stores your active manuscript inside an indexed library on your device without requiring an account, login, or internet connection. Every keystroke triggers a debounce save timer (configurable in Settings between 150ms and 2000ms) so sudden restarts or closed laptops never drop your latest paragraph.',
          'Each book holds its own Author Identity record containing a published pen name, drawn ink signature, and local ECDSA signing key ID. You can also choose how the browser tab and desktop taskbar hover label identify your window: Book Name, Pen Name, Active Section, Brand Only, or a custom template such as "{book} — {section}".',
        ],
        steps: [
          'Click the working title input at the top left of the header and type your manuscript title.',
          'Open Library (bookshelf icon) to enter your Pen Name and verify your active book sits first on the shelf.',
          'Open Settings -> Workspace & Editor -> Window & Taskbar Title to pick whether tabs show your Book Name, Author Name, or Section.',
        ],
        example: {
          heading: 'Recommended Author Preferences',
          body: 'Series authors drafting Book I and Book II side by side often set Window Title Mode to "Quillvibe - <Book Name>" so switching via Alt+Tab or taskbar hover clearly distinguishes each open manuscript.',
        },
        proTip:
          'Even in public coworking spaces, switching Window Title Mode to "Quillvibe Only" hides private book titles from shoulder-surfing taskbars.',
        checkpoint: {
          question: 'Which placeholders are supported when using Custom Window Title Mode in Settings?',
          options: [
            '{book}, {author}, and {section}',
            '{chapter}, {words}, and {isbn}',
            '{theme}, {tier}, and {port}',
          ],
          correctIndex: 0,
          explanation:
            'Custom window titles substitute {book} (title), {author} (pen name), and {section} (active workspace tab) automatically.',
        },
        actionLabel: 'Highlight Title Input',
        minTier: 'basic',
        targetView: 'editor',
        targetSelector: '.bv-book-title-input',
      },
      {
        id: 'm1-tier',
        title: 'Switch Between Focused Drafting and Full Publishing Studio',
        durationMin: 4,
        instruction:
          'Draft in Focused layout for a clean document sheet, then switch to Editorial or Full Studio when you want outlining, Story Bible cross-linking, or Cover Studio.',
        objective: 'Keep the interface calm while drafting and expose specialized tools only when needed.',
        concepts: [
          'Writing stalls when twenty unrelated panels compete for attention on chapter one. Focused layout intentionally hides multi-pane visualizers and cover tools so you see only your binder, clean sheet, and simple typography bar.',
          'Switching to Editorial opens Corkboard index cards, Outline filter ledger, Editorial Proofreading markup, and Interior Print Typesetting. Full Studio opens Story Bible, interactive Story Graph, Vector Book Cover Studio, Collaboration permissions, and .qvext extensions without changing a word of your manuscript.',
        ],
        steps: [
          'Open Settings -> Workspace & Editor (or click the Workspace pill in the bottom-left status bar) to pick Focused, Editorial, or Full Studio.',
          'Start drafting a scene in Focused layout on an Ivory sheet.',
          'Switch to Editorial or Full Studio whenever you are ready to outline scenes or lay out a cover.',
        ],
        example: {
          heading: 'Practical Layout Workflow',
          body: 'Use Focused layout during morning first-draft sprints (500–1,500 new words), then switch to Full Studio during afternoon structural revision and cover layout.',
        },
        proTip:
          'Toolbar labels can also be set in Settings -> Toolbar Detail Mode to Icons Only, Balanced, or Full Details to match your screen size.',
        checkpoint: {
          question: 'Does switching Workspace Layout between Focused and Full Studio delete any Story Bible entries or cover layers?',
          options: [
            'Yes, switching layouts removes cover data',
            'No — Workspace Layouts only filter visible panels while keeping all book data',
            'Only Full Studio scenes are backed up',
          ],
          correctIndex: 1,
          explanation:
            'All parts, scenes, bible profiles, snapshots, and cover layers stay intact inside the book file across every layout.',
        },
        actionLabel: 'Open Workspace Layout Settings',
        minTier: 'basic',
        targetView: 'editor',
        targetSelector: '.qv-tier-pill',
      },
      {
        id: 'm1-resize',
        title: 'Customize Split Column Widths & Parallel Windows',
        durationMin: 4,
        instruction:
          'Drag the <-> handles between the Binder, Paper Sheet, and Inspector to fit your monitor, and launch separate windows from Library to cross-reference two books side by side.',
        objective: 'Arrange a comfortable reading measure and manage multiple manuscripts concurrently.',
        concepts: [
          'Line length strongly affects reading fatigue. By dragging the vertical <-> split resizers on either side of the paper sheet—and adjusting Paper Sheet Width in Settings—you can set a classic 60–75 character book measure on wide monitors or slim laptop screens alike. Your custom widths persist automatically in local cache and desktop storage.',
          'When working on sequels, anthologies, or companion guides, click Window next to any book in Library (or click the New Window button on the topbar) to open that manuscript in its own independent window while preserving shared library saves.',
        ],
        steps: [
          'Move your cursor over the thin vertical divider beside the left Binder or right Inspector until the horizontal resize arrows appear.',
          'Drag to widen or narrow each sidebar; double-click any resizer handle to snap back to default width.',
          'Open Library -> click Window beside a second book to open parallel manuscript windows.',
        ],
        example: {
          heading: 'Laptop Split Layout',
          body: 'Narrow Binder to 210px and Inspector to 230px on 13-inch screens, or close both sidebars cleanly when opening Book Cover Studio.',
        },
        proTip:
          'Whenever you switch into Cover & Typeset Studio or /course, Quillvibe collapses both sidebars automatically and restores your saved open/closed state when you return to Manuscript.',
        checkpoint: {
          question: 'How do you reset a resized sidebar width quickly?',
          options: [
            'Reinstall the application',
            'Double-click the vertical <-> resizer handle or click Reset in Settings',
            'Export to Markdown first',
          ],
          correctIndex: 1,
          explanation:
            'Double-clicking any vertical split handle restores its default pixel width immediately.',
        },
        actionLabel: 'Try Draft Split Panes',
        minTier: 'basic',
        targetView: 'editor',
        targetSelector: '.qv-resizer',
      },
    ],
  },
  {
    id: 'mod-draft',
    number: 2,
    title: 'Drafting Scenes, Right-Click Tools & Immersive Focus',
    summary:
      'Build Parts, Chapters, and Scenes, write cleanly with right-click formatting, and lock in uninterrupted sessions using Immersive Mode and Alarm Ringtones.',
    audience: 'Drafting daily scenes and organizing chapters',
    lessons: [
      {
        id: 'm2-binder',
        title: 'Organize Parts, Chapters, Scenes & Snapshots in the Binder',
        durationMin: 5,
        instruction:
          'Structure long books using nested Parts -> Chapters -> Scenes in the left Binder. Right-click any tree row for instant creation, duplication, movement, or standalone export.',
        objective: 'Split long chapters into manageable 800–2,500 word scenes that reorder cleanly.',
        concepts: [
          'Treating an entire 90,000-word novel as a single scrolling file slows scrolling and makes pacing adjustments painful. Grouping scenes inside Chapters and Parts lets you drag moments earlier or later without copy-pasting thousands of words.',
          'Word counters stay synchronized across Scene, Chapter, and full Book levels on the bottom status bar and inline next to each Binder row so you always know which chapters run long or thin.',
        ],
        steps: [
          'Click + Ch in the Binder header to append a new chapter under your active Part.',
          'Right-click any Scene row to Duplicate it, move it into another chapter, capture a snapshot, or export it as a standalone .qvscene file.',
          'Use Split Scene at Cursor when drafting if one scene naturally pivots into a new location or day.',
        ],
        example: {
          heading: 'Scene Naming Habit',
          body: 'Use working descriptors like "Dockside Confrontation" or "Clara Decodes Ledger" while drafting; Interior Typeset can suppress scene subtitles or insert crisp * * * scene breaks automatically.',
        },
        proTip:
          'Hold nothing back during rough drafts: press Ctrl+S inside Manuscript Editor anytime to capture an immutable Revision Snapshot before experimenting with a bold rewrite.',
        checkpoint: {
          question: 'What happens when you press Ctrl+S while actively editing inside Manuscript view?',
          options: [
            'It downloads an EPUB immediately',
            'It captures a timestamped Revision Snapshot of the active scene (in addition to continuous autosave)',
            'It locks the scene against editing',
          ],
          correctIndex: 1,
          explanation:
            'Continuous autosave already saves prose continuously; Ctrl+S in Editor stores a named checkpoint snapshot you can diff or restore anytime.',
        },
        actionLabel: 'Highlight Binder Tree',
        minTier: 'basic',
        targetView: 'editor',
        targetSelector: '.bv-binder',
      },
      {
        id: 'm2-format',
        title: 'Fast Drafting With Right-Click Context Menus & Keyboard Habits',
        durationMin: 5,
        instruction:
          'Select text inside the paper sheet and right-click for Cut/Copy, **Bold**, *Italic*, Blockquote, Chapter Headings, * * * scene breaks, or Split Scene at Cursor.',
        objective: 'Format prose rapidly with mouse or keyboard without cluttering the writing sheet.',
        concepts: [
          'Every primary workspace in Quillvibe—the Manuscript sheet, Binder rows, Corkboard index cards, Outline rows, Story Graph canvas, and Cover Studio artboard—provides a purpose-built right-click context menu instead of forcing long pointer trips to nested ribbons.',
          'All inline emphasis uses lightweight plain-text Markdown (**bold**, *italic*, > blockquote, ## subheading), ensuring your prose exports cleanly to print typography, EPUB 3, standalone HTML, and archival plain text.',
        ],
        steps: [
          'Select a sentence on the writing sheet and right-click anywhere inside the editor.',
          'Choose Bold (**...**) or Italic (*...*), or press Ctrl+B / Ctrl+I directly while typing.',
          'Right-click an empty line and click Insert Scene Break (* * *) to separate beats inside a scene.',
        ],
        example: {
          heading: 'Scene Break Pattern',
          body: 'Leave one blank line above and below * * * so Interior Typeset converts it into an authentic centered typographic dinkus.',
        },
        proTip:
          'Enable Typewriter Mode on the sub-toolbar so the active typing line stays padded toward the vertical center of the sheet rather than hugging the bottom bezel.',
        checkpoint: {
          question: 'Why does Quillvibe store bold and italic emphasis using ** and * inside scenes?',
          options: [
            'So scenes remain portable, searchable, diffable plain text across EPUB, Print PDF, Markdown, and backups',
            'Because browsers cannot display bold fonts otherwise',
            'To restrict copy and paste',
          ],
          correctIndex: 0,
          explanation:
            'Clean Markdown emphasis avoids brittle proprietary XML blobs while rendering cleanly into typeset print pages and eBooks.',
        },
        actionLabel: 'Focus Paper Sheet',
        minTier: 'basic',
        targetView: 'editor',
        targetSelector: '.bv-prose-textarea',
      },
      {
        id: 'm2-immersive',
        title: 'Ivory/Obsidian Paper, Immersive Fullscreen & Alarm Ringtones',
        durationMin: 4,
        instruction:
          'Press F11 (or click the Fullscreen icon) to enter Immersive Focus Mode with optional live wall clock, sprint timer, word progress, and a built-in Alarm Clock with gentle ringtones.',
        objective: 'Run focused 25- or 45-minute drafting sessions with zero OS distraction.',
        concepts: [
          'The Ivory theme pairs daylight paper contrast with crisp obsidian ink, while Warm Parchment softens contrast for late afternoons and Obsidian Dark protects night-owl eyesight. You can toggle sheet themes independently of the outer studio chrome.',
          'In Immersive Fullscreen mode (especially on the desktop executable), the window expands edge-to-edge with a compact floating status pill. In Settings -> Immersive Fullscreen & Alarm Ringtones you choose whether to show the wall clock, sprint countdown, word goal progress, and Alarm Clock trigger—complete with five built-in Web Audio chimes that require no external audio files.',
        ],
        steps: [
          'Click the Fullscreen button (or press F11) in the top-right bar to enter Immersive Mode.',
          'Click the Alarm icon on the status bar or floating pill to arm a countdown (15m / 25m / 45m / 60m) or exact clock time.',
          'Open Settings -> Workspace & Editor to preview all five synthesized ringtones and adjust volume.',
        ],
        example: {
          heading: 'Daily Pomodoro Writing Block',
          body: 'Set a 45-minute countdown alarm labeled "Chapter Draft Complete" with Dusk Brass Bell or Warm Studio Chime, hide the Binder, and press F11 until the chime brings you back for tea.',
        },
        proTip:
          'On mobile browsers, Quillvibe detects virtual keyboard height via visualViewport so the sheet shrinks smoothly above the keyboard without trapping your cursor off-screen.',
        checkpoint: {
          question: 'Which keyboard shortcut toggles Zen Focus (hides sidebars) versus Immersive Fullscreen?',
          options: [
            'Ctrl+Shift+F toggles Zen Focus; F11 toggles Immersive Fullscreen',
            'F1 toggles Immersive Fullscreen',
            'Ctrl+O opens Immersive Mode',
          ],
          correctIndex: 0,
          explanation:
            'Ctrl+Shift+F hides sidebars inside your window; F11 switches the full display/native window into Immersive Fullscreen.',
        },
        actionLabel: 'Preview Paper Bar',
        minTier: 'basic',
        targetView: 'editor',
        targetSelector: '.bv-subbar',
      },
    ],
  },
  {
    id: 'mod-plot',
    number: 3,
    title: 'Story Architecture: Corkboard, Outline, Bible & Graph',
    summary:
      'Diagnose pacing holes visually on index cards, filter chapter ledgers by POV and location, build character codex dossiers, and map plot threads.',
    audience: 'Structural planners and revisers',
    lessons: [
      {
        id: 'm3-cork',
        title: 'Stage & Reorder Scenes on the Corkboard',
        durationMin: 4,
        instruction:
          'Switch to Corkboard (Editorial or Full Studio layout) to inspect scene synopsis cards side by side, update draft statuses, and drag scenes across chapters.',
        objective: 'Evaluate narrative momentum chapter-by-chapter before rewriting prose.',
        concepts: [
          'Reading prose line-by-line hides pacing flaws. Stepping up to Corkboard flattens every scene into a crisp index card showing scene title, synopsis, POV tag, word count against target progress bar, and workflow state (Outline, Draft, Revision, Final).',
          'Because cards accept drag-and-drop across chapter columns—as well as right-click quick actions—resequencing an investigation scene two chapters earlier takes two seconds instead of manual cut-and-paste.',
        ],
        steps: [
          'Set Workspace Layout to Editorial or Full Studio and open the Corkboard tab.',
          'Edit a scene synopsis directly on the index card and adjust its status badge.',
          'Drag any index card onto another chapter group or right-click to jump straight into Draft Editor.',
        ],
        example: {
          heading: 'Checking Act II Tension',
          body: 'Scan status pills down the Corkboard column: if four consecutive scenes show "Draft, Sub-200w", merge or expand those beats before copyediting.',
        },
        proTip:
          'Keep synopses to two factual sentences: Character Goal -> Scene Outcome/Shift.',
        checkpoint: {
          question: 'What visual feedback helps balance scene lengths on the Corkboard?',
          options: [
            'Progress fill bars showing each scene’s current word count against its word target',
            'Automatic word deletion',
            'Random color shuffling',
          ],
          correctIndex: 0,
          explanation:
            'Each card displays word progress relative to its target alongside status, POV, and synopsis.',
        },
        actionLabel: 'Open Corkboard',
        minTier: 'intermediate',
        targetView: 'corkboard',
        targetSelector: '.bv-main-stage',
      },
      {
        id: 'm3-outline',
        title: 'Filter Pacing, POV & Revision Stage in Outline',
        durationMin: 4,
        instruction:
          'Open Outline to inspect every scene in a sortable spreadsheet ledger and filter cleanly by POV, location, status, or keyword without losing input focus.',
        objective: 'Audit timeline continuity, POV balance, and remaining target words across the whole book.',
        concepts: [
          'In multi-POV novels or historical nonfiction, alternating voices and chronological stamps must follow deliberate rhythm. Outline compacts all metadata—Chapter, Scene, Synopsis, POV, Location, Timeline, Status, Words, and Target—onto one scannable grid.',
          'Right-click any Outline row to change stage immediately, duplicate a beat, or open the scene in the manuscript sheet.',
        ],
        steps: [
          'Open the Outline view and type a character or location into the search filter.',
          'Check POV alternation across Chapters I through V.',
          'Right-click any row showing Outline or Draft to advance or jump straight into editing.',
        ],
        example: {
          heading: 'Continuity Sweep',
          body: 'Type "Winter Harbor" into Outline search to list every scene set at the harbor in exact chronological order.',
        },
        proTip:
          'Combine Outline with Split Reference View in Editor when keeping character ages or travel times consistent.',
        checkpoint: {
          question: 'Which views are unlocked when moving from Basic tier to Intermediate tier?',
          options: [
            'Corkboard, Outline, Proofread Markup, and Typeset Studio',
            'Only Fonts settings',
            'Story Graph only',
          ],
          correctIndex: 0,
          explanation:
            'Intermediate adds Corkboard, Outline, Proofreading tools, and Studio Typesetting, keeping Bible, Graph, and Advanced Cover tools in Full Studio tier.',
        },
        actionLabel: 'Open Outline',
        minTier: 'intermediate',
        targetView: 'outline',
        targetSelector: '.bv-main-stage',
      },
      {
        id: 'm3-bible',
        title: 'Build Characters, Locations, Lore & Automatic Scene Mentions',
        durationMin: 5,
        instruction:
          'Open Story Bible (Advanced tier) to maintain Characters, Locations, Lore, or custom categories with portraits, aliases, and custom traits. Every appearance scans into your scenes automatically.',
        objective: 'Keep worldbuilding details one click away via automated name and alias detection.',
        concepts: [
          'Long books accumulate continuity traps: eye colors drift, aliases change spelling, and minor objects vanish. Quillvibe’s Story Bible automatically scans scene text against both canonical names and aliases using strict word-boundary detection.',
          'While writing inside Manuscript Editor, look at the Scene Inspector on the right: every character, place, or artifact mentioned in the active scene appears immediately as a clickable pill that jumps straight to its dossier or opens it in Split Reference Mode.',
        ],
        steps: [
          'Switch to Advanced tier and open the Story Bible tab.',
          'Create a Character or Location card, add comma-separated Aliases (e.g. "Captain Holm, Clara"), and upload a reference portrait.',
          'Return to any scene mentioning that alias and inspect detected mentions in the right Scene Inspector.',
        ],
        example: {
          heading: 'Alias Linking',
          body: 'Listing "The Cartographer, Tomas" as aliases on Tomas Lindqvist’s card catches scenes referring to him strictly by title.',
        },
        proTip:
          'Add Custom Categories (such as Guilds, Ships, Magic Rules, or Legal Statutes) in Story Bible to fit nonfiction, fantasy, or historical research equally well.',
        checkpoint: {
          question: 'How does Quillvibe detect Story Bible entries inside scenes?',
          options: [
            'It uses boundary-matched name and alias indexing directly against local scene text',
            'It uploads scenes to a cloud indexer',
            'You must tag entries manually with brackets',
          ],
          correctIndex: 0,
          explanation:
            'Local word-boundary indexing checks canonical names and aliases offline in real time.',
        },
        actionLabel: 'Open Story Bible',
        minTier: 'advanced',
        targetView: 'bible',
        targetSelector: '.bv-main-stage',
      },
      {
        id: 'm3-graph',
        title: 'Map Relationships & Arcs on the Dual-Mode Story Graph',
        durationMin: 6,
        instruction:
          'Switch cleanly between Spatial Storyboard (cards, Act Group frames, 90-degree obstacle-avoiding elbow connectors, double-click node creation, and .canvas export) and Force Graph (physics layout, hop filters, and shortest path tracing).',
        objective: 'Visualize causal chains, Act structures, and [[wikilink]] connections cleanly across both spatial boards and dynamic networks.',
        concepts: [
          'In Spatial Storyboard mode, double-click anywhere on the canvas to drop a node, drag Act Group frames to move contained cards together, drag any card port dot to link or spawn a connected card, and drag a selected elbow line handle to fine-tune orthogonal spacing.',
          'Switch to Force Graph mode at any time using the topbar toggle to balance clusters dynamically, pin important plot hubs, isolate 1-to-3 hop neighborhoods, trace the shortest relationship path between two characters, or import/export standard .canvas files and high-resolution PNG/SVG diagrams.',
        ],
        steps: [
          'Open the Graph tab and toggle between Storyboard and Force Graph on the left sub-toolbar.',
          'Write [[Character Name]] or #tags inside a node Markdown panel and click Sync [[Wikilinks]] Now to generate connections automatically.',
          'Use + Group to organize scenes into Act frames, or export the board via .canvas, PNG, or SVG.',
        ],
        example: {
          heading: 'Mystery Clue Board',
          body: 'Link Victim -> Alibi -> Forensic Exhibit -> Suspect Nodes with relationship labels ("forged by", "discovered at") to spot missing clues.',
        },
        proTip:
          'Exporting the Story Graph SVG lets you print or keep an archival plot map alongside your pitch deck.',
        checkpoint: {
          question: 'How do you create a direct link between two cards inside Story Graph?',
          options: [
            'Drag from the circular node edge port (●) on one card onto the target card',
            'Double-click the status bar',
            'Edit CSS manually',
          ],
          correctIndex: 0,
          explanation:
            'Dragging from any card’s edge port creates a live directed relationship edge with configurable label and color.',
        },
        actionLabel: 'Open Story Graph',
        minTier: 'advanced',
        targetView: 'graph',
        targetSelector: '.bv-graph-canvas-wrap',
      },
    ],
  },
  {
    id: 'mod-proof',
    number: 4,
    title: 'Editorial Copyediting: Proofread Markup & Revision Diffs',
    summary:
      'Apply 15 traditional copyediting symbols by right-clicking prose, preview clean accepted copy before committing, and inspect word-by-word diffs.',
    audience: 'Self-editing writers, copyeditors, and proofreaders',
    lessons: [
      {
        id: 'm4-markup',
        title: 'Mark Copy via Right-Click With 15 Standard Proofread Symbols',
        durationMin: 5,
        instruction:
          'Switch Manuscript view to Proofread mode, highlight any passage, and right-click directly on the prose to insert Dele, Caret Insert, Substitute, Transpose, Stet, Space, Italic, or Marginal Query marks.',
        objective: 'Perform non-destructive copyediting without silently overwriting original phrasing.',
        concepts: [
          'Unlike sloppy direct find-and-replace, traditional copyediting tracks proposed changes cleanly against anchor character offsets so an author or collaborator can review each suggestion before committing it to prose.',
          'Quillvibe supports 15 classic proofreader marks: Delete, Caret Insert, Substitute, Margin Query, Highlight, Transpose Words, Stet (let it stand), Paragraph Break, Run-in, Close-up, Space, Capitalize, Lowercase, Italicize, and Boldface—accessible directly from the right-click menu when text is selected.',
        ],
        steps: [
          'Open Manuscript view and click Proofread on the floating paper pill (Intermediate or Advanced tier).',
          'Highlight a word or phrase, right-click directly over the selection, and choose Substitute or Delete.',
          'Type optional margin guidance or click a collaborator badge to attribute the note cleanly.',
        ],
        example: {
          heading: 'Querying Passive Verbs',
          body: 'Apply a Margin Query ("Tighten verb?") on weak constructions rather than deleting immediately, leaving the original rhythm intact during early review.',
        },
        proTip:
          'Integrated Extension "Style & Cliché Scanner" (Extensions modal -> Integrated) can automatically propose proofread marks across repetitive phrases in one click.',
        checkpoint: {
          question: 'What does a Stet proofread mark signify in publishing practice?',
          options: [
            'Ignore an earlier deletion/change and leave the original copy standing as set',
            'Delete the entire chapter',
            'Convert the scene into uppercase',
          ],
          correctIndex: 0,
          explanation:
            'Stet (Latin: "let it stand") restores/keeps original text even if prior marks proposed altering it.',
        },
        actionLabel: 'Open Proofread Mode',
        minTier: 'intermediate',
        targetView: 'editor',
        targetSelector: '.bv-paper-float-nav',
      },
      {
        id: 'm4-clean',
        title: 'Clean Preview, Inspector Navigation & Snapshot Safety',
        durationMin: 4,
        instruction:
          'Use Clean Preview to read accepted prose flow smoothly, jump straight to open marks from Scene Inspector, and commit marks cleanly with automatic backup snapshots.',
        objective: 'Resolve open copyedits confidently while always keeping an undoable safety snapshot.',
        concepts: [
          'Visual strikethroughs and carets can make rhythm hard to hear. Toggling Clean Preview temporarily renders how the page reads once every accepted/open mark is applied without committing changes yet.',
          'When satisfied, clicking Accept All in Proofread mode automatically creates a timestamped snapshot of the scene first, then applies every open mark cleanly in reverse offset order so later offsets never drift.',
        ],
        steps: [
          'Toggle Clean Preview inside the Proofread bar to read the revised prose cadence aloud.',
          'Inspect open marks in the right Scene Inspector and click Review on any item to scroll straight to it.',
          'Accept or Reject individual marks, or click Accept All knowing a backup snapshot is created automatically.',
        ],
        example: {
          heading: 'Final Proofread Sign-Off',
          body: 'Before exporting an EPUB or print proof, verify the Publish checklist shows zero open proofread marks across chapters.',
        },
        proTip:
          'Never delete marks manually inside raw text—always resolve them via Accept/Reject/Stet so alignment offsets stay exact.',
        checkpoint: {
          question: 'What safeguard runs automatically when clicking Accept All Marks in Proofread mode?',
          options: [
            'An automatic Revision Snapshot is saved before applying edits to the scene prose',
            'Your manuscript uploads to a server',
            'Chapters are merged into one scene',
          ],
          correctIndex: 0,
          explanation:
            'Quillvibe automatically captures a snapshot checkpoint immediately before committing batch proofread marks.',
        },
        actionLabel: 'Inspect Proofread Controls',
        minTier: 'intermediate',
        targetView: 'editor',
        targetSelector: '.bv-main-stage',
      },
      {
        id: 'm4-diff',
        title: 'Compare Prose Against Any Snapshot With Word-Level Diff',
        durationMin: 4,
        instruction:
          'Switch the paper pill to Revision Diff (Advanced tier) to view color-coded inserted and deleted words comparing live prose against any earlier snapshot.',
        objective: 'Audit major rewrites accurately and recover strong lines removed earlier.',
        concepts: [
          'After tearing apart an opening chapter, writers frequently worry that the earlier draft carried better pacing. Revision Diff calculates a true longest-common-subsequence word diff between your live scene and any stored snapshot.',
          'Removed words appear clearly with strikethrough and additions highlight cleanly—and restoring a prior snapshot creates a fresh "Auto-backup before restore" snapshot so nothing in either version is ever lost.',
        ],
        steps: [
          'Ensure your scene has at least one Snapshot (press Ctrl+S inside Editor to create one).',
          'Switch the Manuscript floating mode switcher to Revision Diff.',
          'Pick a snapshot from the dropdown to inspect word-level changes, or capture the difference in notes.',
        ],
        example: {
          heading: 'Cutting 20% in Line Edits',
          body: 'Capture a "Pre-Cut Draft" snapshot before tightening Chapter 1; Revision Diff shows net cut word counts and ensures key plot clues survived.',
        },
        proTip:
          'Combine snapshots with Co-Author merges: whenever an offline LAN/Bluetooth sync detects a conflict, it automatically stores the peer revision as a readable snapshot so you can diff it here.',
        checkpoint: {
          question: 'If you restore an older snapshot, what happens to your current draft words?',
          options: [
            'Quillvibe saves an automatic backup snapshot of your current text before restoring',
            'Your current draft is wiped permanently',
            'Only the title is restored',
          ],
          correctIndex: 0,
          explanation:
            'Restoring automatically generates an "Auto-backup before restore" snapshot first.',
        },
        actionLabel: 'Open Diff Mode',
        minTier: 'advanced',
        targetView: 'editor',
        targetSelector: '.bv-paper-float-nav',
      },
    ],
  },
  {
    id: 'mod-typeset',
    number: 5,
    title: 'Interior Print Typesetting & Custom Typography',
    summary:
      'Set trade book trim dimensions, drop caps, smart typography, running headers, installed OS/file fonts, Table of Contents, and Print PDF output.',
    audience: 'Authors preparing paperback, hardcover, or EPUB interiors',
    lessons: [
      {
        id: 'm5-interior',
        title: 'Trim Size, Margins, Drop Caps & Custom Typefaces (.ttf / .otf)',
        durationMin: 5,
        instruction:
          'Open Studio -> Interior Typeset to pick US/UK trade trim sizes (5x8, 5.5x8.5, 6x9, A5, Royal), install local .ttf/.otf/.woff2 fonts, configure drop caps, and inspect multi-page pagination.',
        objective: 'Transform raw draft prose into balanced book spreads matching print house specifications.',
        concepts: [
          'Standard consumer word processors default to 8.5×11 office sheets. Printed trade books use specific dimensions like 5×8 pocket fiction, 5.5×8.5 digest nonfiction, or 6×9 standard trade with mirrored inside gutter margins and proportioned text blocks.',
          'Under Settings -> Typefaces & Fonts, you can drop any licensed .ttf, .otf, or .woff2 font file (validated locally by magic-byte header) or pick an installed OS font and apply it independently to your writing desk or your final typeset book.',
        ],
        steps: [
          'Open Studio -> Interior Typeset (Binder collapses automatically for wider preview spreads).',
          'Pick a trim preset (e.g. 6" × 9" Standard Trade) and choose Book Serif font family or custom installed font.',
          'Toggle Drop Caps, Smart Quotes/Em-Dashes, and Chapter Numeral Style (Roman, Word, or Numeric).',
        ],
        example: {
          heading: 'Classic Trade Interior Stack',
          body: '6" × 9" trim, 11pt Garamond or Baskerville serif, 1.5 line height, First-Line Indents enabled, Roman numeral chapter titles, and Drop Caps on chapter openings.',
        },
        proTip:
          'Exporting a .qvstyle preset lets you reuse your imprint’s exact interior typography measurements across an entire series in one click.',
        checkpoint: {
          question: 'Where do you install custom .ttf or .otf fonts for your book’s Interior Typeset & Covers?',
          options: [
            'Settings -> Typefaces & Fonts (drag-and-drop file or OS system font picker)',
            'Story Graph edge inspector',
            'Corkboard status dropdown',
          ],
          correctIndex: 0,
          explanation:
            'Settings -> Typefaces & Fonts validates magic bytes locally and exposes installed typefaces across Draft, Interior Typeset, and Cover Studio.',
        },
        actionLabel: 'Go to Interior Typeset',
        minTier: 'intermediate',
        targetView: 'typeset',
        targetTypesetTab: 'interior',
      },
      {
        id: 'm5-printpdf',
        title: 'Verify Front Matter, Table of Contents & Export Print PDF / EPUB 3',
        durationMin: 4,
        instruction:
          'Review automatically generated Title Page, Dedication, Copyright Page, Table of Contents, and Collaborator Credits inside the typeset preview before printing PDF or building EPUB 3.',
        objective: 'Inspect pagination flow cleanly and produce press-grade PDF or validated EPUB 3 packages.',
        concepts: [
          'Interior Typeset compiles front matter (title page, dedication, copyright notice, co-author/proofreader credits, and Table of Contents) ahead of Part/Chapter spreads with running headers showing book title and chapter markers.',
          'Clicking Print / Save PDF formats dedicated print stylesheets (`@media print`) or generates a downloadable `.pdf` without app chrome, while Export EPUB 3 packages standards-compliant XHTML chapters, NCX/OPF navigation, metadata, and your active Front Cover art into a single `.epub` archive ready for e-readers and digital bookstores.',
        ],
        steps: [
          'Confirm Dedication and Copyright Notice fields in Interior Typeset settings.',
          'Scroll through the paginated book preview to check Title Page, Contents, and Chapter I flow.',
          'Click Print / Save PDF or Export EPUB 3 (or pick .epub from the top-right Save extension bar).',
        ],
        example: {
          heading: 'Two-Format Proof Check',
          body: 'Save an EPUB 3 onto an e-reader for an evening read-through alongside printing a Print PDF proof—reading in a fresh layout reveals typos invisible in the draft editor.',
        },
        proTip:
          'When exporting EPUB 3, Quillvibe automatically embeds the live rendered canvas of your Book Cover Studio design as `cover.png`.',
        checkpoint: {
          question: 'What happens to Quillvibe navigation bars when choosing Print / Save PDF?',
          options: [
            'Print CSS hides all toolbars, sidebars, and UI chrome so only crisp formatted book pages print',
            'Topbar buttons print on page 1',
            'Every chapter prints at 50% zoom',
          ],
          correctIndex: 0,
          explanation:
            'Dedicated `@media print` rules strip every workspace panel so output contains strictly the book pages.',
        },
        actionLabel: 'Check Print Preview',
        minTier: 'intermediate',
        targetView: 'typeset',
        targetTypesetTab: 'interior',
      },
    ],
  },
  {
    id: 'mod-cover',
    number: 6,
    title: 'Cover Studio: Vector Shapes, Gradients & Wraps',
    summary:
      'Design covers across Front, Back, Spine, and Flaps using multi-layer text, geometric vector shapes, ornaments, corner resize handles, snap guides, and high-resolution PNG/PDF export.',
    audience: 'Authors designing eBook fronts and full print wraps',
    lessons: [
      {
        id: 'm6-layers',
        title: 'Compose Multi-Layer Covers With Vector Shapes, SVGs & Gradients',
        durationMin: 6,
        instruction:
          'Open Studio -> Book Cover Studio. Add unlimited display text boxes, geometric vector shapes, crisp SVG ornaments, or drop your own transparent .png/.svg assets onto any face.',
        objective: 'Build balanced jacket artwork with clean visual hierarchy, blend filters, and undoable transforms.',
        concepts: [
          'Professional book covers rely on clean typography spacing and restrained contrast—not crowded filters. In Cover Studio, every headline, subtitle, author credit, edition pill, vector shape (rectangles, circles, stars, triangles, arrows, hexagons), and uploaded graphic lives on an addressable stack with 100-step Undo/Redo, Ctrl+G layer grouping, 8-point resize and rotation handles, and inline double-click text editing right on the artboard.',
          'You can switch backgrounds between solid color, dual-stop linear gradients, or full-bleed artwork with live Brightness, Contrast, Blur, and Tint Dim controls so light display ink pops reliably over photography.',
        ],
        steps: [
          'Open Studio -> Book Cover Studio (Advanced tier) and note the left tool rail, center artboard, and right Inspector.',
          'Pick a base palette or gradient on the left panel, then click Vector Shapes or Add Text Layer to place architectural dividers or praise ribbons.',
          'Drop a custom .svg or transparent .png directly onto the canvas, drag to position, and inspect Layer Stack ordering.',
        ],
        example: {
          heading: 'Editorial Cloth-Band Jacket',
          body: 'Pair a deep obsidian base background with a warm bronze horizontal rule shape (12px thick), an ivory serif title sized at 54pt, and subtle uppercase tracked author name at the bottom edge.',
        },
        proTip:
          'Lock completed background layers with the padlock button in the Layer Stack so clicking foreground typography never shifts artwork beneath it.',
        checkpoint: {
          question: 'Can you recover if an alignment nudge or deletion inside Cover Studio goes wrong?',
          options: [
            'Yes — Cover Studio maintains a dedicated Undo/Redo stack alongside global project history',
            'Only by reloading the browser',
            'No, shape layers are permanent',
          ],
          correctIndex: 0,
          explanation:
            'Use Undo/Redo buttons on the studio bar or Ctrl+Z inside Cover Studio to step cleanly through layout edits.',
        },
        actionLabel: 'Open Cover Studio',
        minTier: 'advanced',
        targetView: 'typeset',
        targetTypesetTab: 'cover',
      },
      {
        id: 'm6-snap',
        title: 'Use Snap-to-Grid, Magnetic Alignment & Full Print Wrap Faces',
        durationMin: 5,
        instruction:
          'Toggle Snap-to-Grid and Bleed Guides to center elements cleanly across Front Cover, Spine, Back Cover, Front Flap, and Back Flap, zoom between 10% and 500% with Space+Drag panning, and export 1x/2x/3x PNG, Transparent PNG, JPEG, Vector SVG, or Print Interior PDF.',
        objective: 'Eliminate off-center titles and verify calculated paperback spine width from manuscript page count.',
        concepts: [
          'A slight 3% off-center title ruins an otherwise striking cover. Turning on Snap & Guides activates quantized grid increments alongside live magnetic amber center lines whenever an element aligns to 50% horizontal, 25%/75% quarters, or safe trim margins.',
          'Switching the face selector between Front Cover, Back Cover (with author bio and ISBN barcode placeholder box), Spine (width computed automatically from estimated book page count), and Dust Jacket Flaps gives complete control over physical wrap production.',
        ],
        steps: [
          'Toggle Snap & Bleed Guides in the Cover Studio top bar and drag the Title element toward horizontal center until the dashed amber guide snaps cleanly.',
          'Switch Face to Back Cover to write your jacket blurb, Author Bio, and toggle the ISBN barcode box.',
          'Switch to Full Wrap view to inspect Spine lettering beside Front and Back, then click Export Front PNG or Full Wrap PNG.',
        ],
        example: {
          heading: 'Right-Click Canvas Menu',
          body: 'Right-click any layer directly on the Cover Studio canvas to Center Horizontally, Bring Forward, Send Backward, Duplicate Layer, or Lock Position.',
        },
        proTip:
          'Before printing wraps, finalize scene prose roughly so estimated page count produces accurate spine thickness.',
        checkpoint: {
          question: 'How does Quillvibe determine paperback Spine width in Full Wrap mode?',
          options: [
            'It calculates spine width from estimated manuscript page count alongside trim settings',
            'It locks spine permanently at 2 inches',
            'It ignores manuscript length',
          ],
          correctIndex: 0,
          explanation:
            'Spine geometry updates automatically from manuscript word count and standard paper bulk.',
        },
        actionLabel: 'Inspect Full Wrap',
        minTier: 'advanced',
        targetView: 'typeset',
        targetTypesetTab: 'cover',
      },
      {
        id: 'm6-vector-draw-urls',
        title: 'Desktop Vector Pen, Freehand Brush, Blend Modes & Artwork URLs',
        durationMin: 6,
        instruction:
          'In the Desktop App, use Cover Studio -> Draw for freehand brush strokes and multi-point vector paths, switch layer Blend Modes (Multiply, Screen, Overlay, Soft Light), or paste an https:// artwork URL in Uploads.',
        objective: 'Combine custom vector illustration strokes, blended shapes, and embedded remote photography inside print-ready covers.',
        concepts: [
          'The Draw tool rail tab (Desktop App only) provides two drawing modes: Freehand Brush sketches organic strokes as you drag across the front, spine, or back cover; Vector Pen places crisp straight-segment polygon/polyline anchors you commit as an editable SVG path layer.',
          'Every vector path, shape, graphic, and custom text layer supports per-layer Opacity plus 7 optical Blend Modes (Normal, Multiply, Screen, Overlay, Soft Light, Darken, Lighten) so textures, foil accents, and photography fuse naturally cleanly in live preview, PNG, JPEG, and Vector SVG exports.',
          'Under Uploads, Paste Image URL accepts clean https:// links or safe data:image URIs and downloads/embeds the raster pixels locally inside your project so exported Print wraps and .qv archives keep working completely offline. If an external image host disables cross-origin headers (CORS), Quillvibe reports it cleanly so you can save locally and upload instead.',
        ],
        steps: [
          'Open Studio -> Book Cover Studio (Full Studio layout in the Desktop App) and open the Draw tab.',
          'Draw a freehand accent curve or switch to Vector Pen, place 4+ anchor points on the cover, and click Commit Vector Path.',
          'Select the created path (or any uploaded photo/shape), adjust Stroke Width, Opacity, and try Multiply or Overlay Blend Mode in the right Properties panel.',
          'Open Uploads, paste an https:// image URL into Paste Image URL, and click Add as Layer or Set as Backdrop.',
        ],
        example: {
          heading: 'Soft Foil Glow Overlay',
          body: 'Draw a wide closed polygon across the upper third of a photographic cover, set its Fill Color to warm brass (#c7a97b), lower Opacity to 35%, and pick Overlay blend mode to cast atmospheric golden warmth over skies without obscuring details.',
        },
        proTip:
          'All vector paths scale cleanly when exporting Vector SVG (.svg) or ultra-high-res 3x PNG (1800 x 2880).',
        checkpoint: {
          question: 'Why does Paste Image URL convert a pasted https:// image into local embedded pixels inside your cover project?',
          options: [
            'So your cover exports and offline .qv / .qvdesign backups remain self-contained even without internet access',
            'So the image is deleted from your hard drive',
            'To lock the cover permanently against editing',
          ],
          correctIndex: 0,
          explanation:
            'Embedding the image locally ensures Print wraps, EPUB covers, and .qvdesign files never break if a website link goes offline later.',
        },
        actionLabel: 'Open Cover Draw Tools',
        minTier: 'advanced',
        targetView: 'typeset',
        targetTypesetTab: 'cover',
      },
      {
        id: 'm6-variants-compare',
        title: 'Drafting Cover Concepts & Running Side-by-Side Comparisons',
        durationMin: 4,
        instruction:
          'Save each stylistic direction inside the Drafts tab (Desktop App), then open Compare Side-by-Side to judge typography scale, contrast, and mood directly against rival drafts.',
        objective: 'Explore multiple strong cover compositions without losing earlier typography or color arrangements.',
        concepts: [
          'Strong book covers rarely succeed on the very first pass. Save early typography concepts as named Draft Variants (e.g., "Dark Serif Minimal", "Full-Bleed Landscape", "Editorial Band") inside Cover Studio.',
          'Side-by-Side Comparison renders any two drafts—or compares a saved draft against your current working canvas—at identical scale, displaying layer counts and template family so you can promote the sharpest direction in one click.',
        ],
        steps: [
          'Build your first clean cover layout, open the Drafts tool tab, enter a short name, and click Save Current as Draft.',
          'Experiment freely with a different backdrop gradient, ornament, or palette and save a second draft.',
          'Click Compare Side-by-Side, pick Left and Right concepts, evaluate title legibility at thumbnail scale, and click Promote Winner on the stronger design.',
        ],
        example: {
          heading: 'Thumbnail Contrast Audit',
          body: 'Store readers first see book covers at tiny ~120px thumbnails. Compare a serif-on-dark draft against a stark ivory draft side-by-side to see whose title remains readable across room distance.',
        },
        proTip:
          'Save your active layout as a Draft Variant right before testing bold gradient experiments so returning takes one click.',
        checkpoint: {
          question: 'What happens when you click Promote Winner in Side-by-Side Comparison?',
          options: [
            'The chosen draft becomes your active cover while keeping your saved variants and review pins intact',
            'All other scenes in your book are deleted',
            'Your font size resets to 8px',
          ],
          correctIndex: 0,
          explanation:
            'Promoting a draft swaps the active artwork layout safely while keeping your library of saved variants and collaboration pins.',
        },
        actionLabel: 'Compare Cover Drafts',
        minTier: 'advanced',
        targetView: 'typeset',
        targetTypesetTab: 'cover',
      },
      {
        id: 'm6-qvdesign-collab',
        title: 'Collaborating with Designers & Co-Authors Using .qvdesign',
        durationMin: 5,
        instruction:
          'Open Collab in Cover Studio (Desktop App) to drop numbered feedback pins directly on cover faces and export/merge editable .qvdesign packages.',
        objective: 'Exchange cover layouts and art critiques without shipping your private manuscript prose.',
        concepts: [
          'The official .qvdesign extension bundles your editable Cover Studio configuration—templates, typography, vector paths, shapes, embedded artwork, draft variants, and numbered review pins—without including manuscript chapters or Story Bible secrets.',
          'Co-authors and cover illustrators can open your .qvdesign in Quillvibe Desktop, add numbered canvas review pins on Front, Spine, or Back cover faces, edit vector layers, and send back an updated .qvdesign. When it arrives, choose Import .qvdesign to load their full design or Merge Pins Only to pull feedback notes onto your current canvas.',
        ],
        steps: [
          'Open the Collab tab in Cover Studio, enter your name, click Click Cover to Drop Pin, and click any region on the canvas.',
          'Click Export .qvdesign to save a shareable design archive for an illustrator, publisher, or co-author.',
          'When updated feedback arrives back, click Import .qvdesign or Merge Pins Only and resolve each pin as edits land.',
        ],
        example: {
          heading: 'Separate Art & Manuscript Handoff',
          body: 'Send an illustrator only .qvdesign (cover + spine width + pins) and .qvbible (character appearance notes) while keeping unpublished ending chapters strictly inside your sealed .qv file.',
        },
        proTip:
          'Double-clicking a .qvdesign file on Windows, macOS, or Linux desktop opens it directly into the Quillvibe Desktop window.',
        checkpoint: {
          question: 'When receiving feedback notes from an editor inside a .qvdesign file while keeping your own newer cover layout, which option should you use?',
          options: [
            'Merge Pins Only',
            'Delete All Layers',
            'Export Plain Text (.txt)',
          ],
          correctIndex: 0,
          explanation:
            'Merge Pins Only imports review pins without overwriting your local layer artwork edits.',
        },
        actionLabel: 'Open Cover Collaboration',
        minTier: 'advanced',
        targetView: 'typeset',
        targetTypesetTab: 'cover',
      },
    ],
  },
  {
    id: 'mod-publish',
    number: 7,
    title: 'Author Sealing, Secure LAN/Bluetooth/Enterprise Sync & Release',
    summary:
      'Sign your finished edition with a cryptographic ECDSA Author Key, sync safely with teams over Wi-Fi, Bluetooth, or your own HTTPS server, and publish.',
    audience: 'Teams, publishers, and authors shipping final editions',
    lessons: [
      {
        id: 'm7-seal',
        title: 'Cryptographic ECDSA Author Sealing & Preflight Checklist',
        durationMin: 4,
        instruction:
          'Open Studio -> Publish & Author Seal (or Library) to generate your local WebCrypto ECDSA P-256 Origin Key (QVK-/QVD-), register a separate Work Copyright Seal (QVC-), and verify every preflight check turns green.',
        objective: 'Distinguish original device & pen-name identity from work copyright ownership inside your `.qv` release bundle.',
        concepts: [
          'Quillvibe keeps two distinct seals: your permanent Author & Origin Device Key (`QVK-` + `QVD-`) identifies who created the manuscript and which device it originated on, while the Work Copyright Seal (`QVC-`) records copyright ownership, territory rights, and notice inside the finished book.',
          'The Publish Preflight Checklist audits common slip-ups automatically: book title & pen name filled, non-empty chapters, zero remaining open proofread marks, Cover Studio artwork populated, Origin Device verification, and Work Copyright registration.',
        ],
        steps: [
          'Open Studio -> Publish & Author Seal (Advanced tier).',
          'Click Create Permanent Author Key -> Sign & Seal Origin to bind your pen name and origin device ID (`QVD-`).',
          'Click Seal Work Copyright to stamp a `QVC-` copyright ownership certificate alongside your release exports.',
        ],
        example: {
          heading: 'Imprint Archival Master',
          body: 'Keep one sealed `.qv` master bundle alongside your `.epub` and Print Interior `.pdf` inside a dated release folder for every edition print run.',
        },
        proTip:
          'Back up your Author Key fingerprint cleanly; generating a fresh key creates a new key ID for future releases.',
        checkpoint: {
          question: 'Where are Author Keys generated and used during manuscript signing?',
          options: [
            'Strictly on your own device via standard browser/WebCrypto ECDSA APIs',
            'On a remote cloud key escrow server',
            'Inside external email attachments',
          ],
          correctIndex: 0,
          explanation:
            'Quillvibe generates and uses P-256 ECDSA keys purely locally on your device.',
        },
        actionLabel: 'Go to Publish & Seal',
        minTier: 'advanced',
        targetView: 'typeset',
        targetTypesetTab: 'publish',
      },
      {
        id: 'm7-collab',
        title: 'Collaborate Over Local Wi-Fi, Bluetooth, or Self-Hosted HTTPS Servers',
        durationMin: 5,
        instruction:
          'Use Offline Collaboration -> Wi-Fi LAN for PIN-paired desk sync, Bluetooth with SHA-256 checksums for air-gapped handoffs, or Enterprise / Website Sync to connect your own TLS server.',
        objective: 'Exchange co-author edits safely without exposing drafts to third-party SaaS clouds.',
        concepts: [
          'Teams sitting in the same studio can run Same-Wi-Fi LAN Sync directly between desktop executables, protected by a constant-time 6-digit PIN and private IPv4 checks that block unintended external traffic. Air-gapped rooms can share `.qv` packages via OS Bluetooth wizards and compare displayed SHA-256 checksums.',
          'Organizations or authors who operate their own domain can use the Enterprise / Website Sync tab to connect directly to a personal website or company HTTPS endpoint (`GET /books/:id` and `PUT /books/:id`) using Bearer or custom API key headers stored strictly in active session memory—never exported into book files. Adding a Co-Author also requires a cryptographically signed `QVCA1.` token generated on the co-writer’s separate device.',
        ],
        steps: [
          'Open Collaboration from the topbar (Advanced tier) and inspect all four tabs: Credits, Same-Wi-Fi, Bluetooth, and Enterprise / Website Sync.',
          'On a co-author’s second device, click Generate My Device Co-Author Key Token and paste that `QVCA1.` token on the primary device to verify separate-device co-writing.',
          'For teams using their own server, enter your https:// URL, book ID, and session token, test connection, and Push/Pull revisions with automatic snapshot conflict safety.',
        ],
        example: {
          heading: 'Editorial House Server Integration',
          body: 'A boutique publisher configures `https://editorial.myhouse.com/qv-sync` with per-editor Bearer tokens; copyeditors pull `.qv` drafts in a web browser or the desktop app, add proofread marks, and push back safely.',
        },
        proTip:
          'Plain unencrypted `http://` URLs are rejected automatically for public hostnames in Enterprise Sync; use `https://` everywhere outside localhost/LAN.',
        checkpoint: {
          question: 'How does Quillvibe protect conflicting edits when merging a collaborator file over LAN, Bluetooth, or Enterprise Sync?',
          options: [
            'Newer text merges cleanly while conflicting rival versions are preserved as readable Snapshots on the scene',
            'Remote text overwrites local work silently',
            'Both scenes are deleted',
          ],
          correctIndex: 0,
          explanation:
            'Merge logic compares revision timestamps and always preserves conflicting prose in scene Snapshots so zero lines disappear.',
        },
        actionLabel: 'Open Collaboration Hub',
        minTier: 'advanced',
        targetView: 'editor',
        targetSelector: '.bv-topbar-actions',
      },
      {
        id: 'm7-export',
        title: 'Choose File Formats: .qv Workspace, .pdf, .epub, & Legacy Imports',
        durationMin: 4,
        instruction:
          'Pick `.qv` as your default whole-book workspace format in the top-right save selector, or export `.pdf`, `.epub`, `.qvbible`, `.qvscene`, `.qvstyle`, `.md`, `.html`, and `.txt` packages.',
        objective: 'Archive complete books cleanly in `.qv` while importing older `.quillvibe` and `.bookvibe` files.',
        concepts: [
          'Quillvibe encodes all four official extensions (`.qv`, `.qvbible`, `.qvscene`, `.qvstyle`) in its protected binary container (`QVBX`) so external text editors or third-party converters cannot decode, alter, or swap data inside them.',
          'Older `.quillvibe`, `.qvibe`, `.qvbook`, `.bookvibe`, and `.bv*` archives stay separated from OS double-click associations. Whenever you need an older file, import it explicitly through Settings -> Publishing & Archive -> Import Legacy Archive.',
        ],
        steps: [
          'Click the extension selector beside the top-right Save icon and set `.qv` as your default quick-export format.',
          'Press Save/Export to save a protected `.qv` book workspace onto your drive.',
          'To bring in an older `.quillvibe` or `.bookvibe` file, open Settings -> Publishing & Archive and click Import Legacy Archive.',
        ],
        example: {
          heading: 'Sharing a World Bible Only',
          body: 'Export `.qvbible` when letting a beta-reader or illustrator browse character traits and reference portraits without sharing unfinished ending chapters.',
        },
        proTip:
          'You can also import `.docx` documents, Web HTML `.html`, `.rtf`, `.md`, or `.txt` manuscripts from Settings -> Publishing & Archive.',
        checkpoint: {
          question: 'Which extension preserves ALL book data—manuscript, Story Bible, Graph nodes, Cover Studio layers, Copyright Seal, and Typeset settings—in a single portable file?',
          options: ['.qv', '.txt only', '.qvstyle'],
          correctIndex: 0,
          explanation:
            '.qv archives serialize the full QUILLVIBE_V2 workspace so restoring onto any computer recovers every piece of the project.',
        },
        actionLabel: 'Open Publish Extensions',
        minTier: 'advanced',
        targetView: 'typeset',
        targetTypesetTab: 'publish',
      },
    ],
  },
  {
    id: 'mod-security',
    number: 8,
    title: 'Protected File Locks (QVBX), Passwords & Safety Checks',
    summary:
      'Learn why Quillvibe uses its own sealed file format, how export passwords work, how tampered or broken files are stopped, and how to bring in older files.',
    audience: 'Authors protecting drafts, passwords, and file integrity',
    lessons: [
      {
        id: 'm8-qvbx',
        title: 'How Quillvibe Seals Your Book Inside Protected QVBX Files',
        durationMin: 4,
        instruction:
          'Export any `.qv`, `.qvbible`, `.qvscene`, or `.qvstyle` file from the Save menu. Quillvibe writes a sealed binary file that only Quillvibe can read.',
        objective: 'Keep drafts private and unreadable to outside programs or plain-text viewers.',
        concepts: [
          'Just like desktop office suites store documents in their own binary container rather than raw editable JSON, Quillvibe packs every exported file inside a sealed `QVBX` binary container using authenticated encryption (`AES-GCM`).',
          'If someone opens a `.qv` file in a plain-text viewer or feeds it into an outside decoder, the bytes look scrambled. Modifying even one character breaks the check tag, so Quillvibe warns you right away instead of loading broken chapters.',
        ],
        steps: [
          'Pick `.qv` (or `.qvbible`, `.qvscene`, `.qvstyle`, `.pdf`, `.epub`) in the top-right Save dropdown.',
          'Click Save/Export to save the sealed file to your disk (a progress pill confirms loading during large exports).',
          'Open the file back in Quillvibe with Ctrl+O or by dropping it onto the workspace.',
        ],
        example: {
          heading: 'Sending a Clean Master Copy',
          body: 'Send a sealed `.qv` file to your verified co-author over USB or LAN sync knowing random viewers cannot open its chapters in a plain text editor.',
        },
        proTip:
          'Your active workspace still saves quickly in your browser or desktop data folder so everyday typing stays fast.',
        checkpoint: {
          question: 'What happens if an outside program edits bytes inside a sealed `.qv` file?',
          options: [
            'Quillvibe catches the mismatch and refuses to open the damaged data',
            'Quillvibe guesses the missing words automatically',
            'Nothing happens and the broken text overwrites your good copy',
          ],
          correctIndex: 0,
          explanation:
            'Every `QVBX` file checks a cryptographic integrity tag before decoding, so damaged or altered files are stopped cleanly.',
        },
        actionLabel: 'Inspect Protected Formats',
        minTier: 'basic',
        targetView: 'editor',
        targetSelector: '.bv-save-split',
      },
      {
        id: 'm8-password',
        title: 'Lock Exports With a Password & Spot Unsafe Content',
        durationMin: 5,
        instruction:
          'Use Studio -> Publish -> Password-Locked .qv (or turn on required export passwords in Settings) to lock exports with your own password. Quillvibe also scans incoming files for scripts or executable programs.',
        objective: 'Protect sensitive manuscripts with passwords and stop suspicious payloads on open.',
        concepts: [
          'When you add a password at export time, Quillvibe turns that password into a strong encryption key using 150,000 PBKDF2 rounds. Anyone opening the file in Quillvibe must enter the exact password. Wrong passwords or broken bytes stay scrambled and cannot be restored.',
          'Before a decoded book touches your library, Quillvibe checks for disguised executables (`MZ`), script injection tags (`<script>`), event handlers, or altered Author Keys so untrusted files cannot sneak harmful data into your workspace.',
        ],
        steps: [
          'Open Studio -> Publish & Author Seal (Intermediate/Advanced) and click Password-Locked .qv.',
          'Type a password you remember cleanly (there is no remote reset button).',
          'Test opening the saved file via Ctrl+O to verify the unlock prompt works.',
        ],
        example: {
          heading: 'Before Embargo Release Day',
          body: 'Publishers preparing pre-release galleys turn on Require password on every QVBX file export in Settings -> Publishing & Archive so zero unencrypted copies leave the office.',
        },
        proTip:
          'Never store your export password inside the book title or Synopsis card—share it with your team through a separate message.',
        checkpoint: {
          question: 'Can Quillvibe recover a password-locked `.qv` file if the password is lost?',
          options: [
            'No — there is no backdoor, so keep a safe note of any password you set',
            'Yes, email support resets every password',
            'Opening it twice bypasses the lock',
          ],
          correctIndex: 0,
          explanation:
            'Passwords derive the encryption key locally on your device, so without the password the contents stay locked.',
        },
        actionLabel: 'Open Password Export',
        minTier: 'intermediate',
        targetView: 'typeset',
        targetTypesetTab: 'publish',
      },
      {
        id: 'm8-legacy',
        title: 'Import Legacy .quillvibe & .bookvibe Archives Safely',
        durationMin: 3,
        instruction:
          'Legacy `.quillvibe`, `.qvibe`, `.qvbook`, `.bookvibe`, and `.bv*` files no longer open on double-click. Open Settings -> Publishing & Archive and click Import Legacy Archive whenever you want to bring one forward into `.qv`.',
        objective: 'Upgrade older manuscripts cleanly while keeping modern OS file registration focused strictly on `.qv` and `.qv*`.',
        concepts: [
          'Consolidating double-click associations around `.qv`, `.qvbible`, `.qvscene`, and `.qvstyle` keeps Windows, macOS, and Linux clean without duplicate extensions.',
          'At the same time, you never lose access to older books: the explicit importer in Settings -> Publishing & Archive reads old `.quillvibe`, `.qvbook`, `.bookvibe`, and `.bv*` files directly and upgrades them inside your library.',
        ],
        steps: [
          'Open Settings (gear icon) and select Publishing & Archive.',
          'Scroll to the Import section and click Import Legacy Archive.',
          'Pick the old file, let Quillvibe load it, and save a new `.qv` copy going forward.',
        ],
        example: {
          heading: 'Archiving a Series Backlist',
          body: 'Import Book 1 from an older `.bookvibe` or `.quillvibe` backup, verify chapters and Story Bible items, then export `book-1.qv` so all books share the same modern format.',
        },
        proTip:
          'Keep your original legacy file in an archive folder as a read-only backup after converting.',
        checkpoint: {
          question: 'Where do you open an old `.bookvibe` or `.quillvibe` archive in Quillvibe?',
          options: [
            'Settings -> Publishing & Archive -> Import Legacy Archive',
            'Double-click it on the Desktop',
            'Rename it to .png first',
          ],
          correctIndex: 0,
          explanation:
            'Legacy archives load through the explicit importer in Settings so modern OS double-click rules stay clean on `.qv`.',
        },
        actionLabel: 'Open Settings',
        minTier: 'basic',
        targetView: 'editor',
        targetSelector: '.bv-topbar-actions',
      },
    ],
  },
  {
    id: 'mod-teams',
    number: 9,
    title: 'Forever Author Keys, Team Permissions & Commercial Releases',
    summary:
      'Bind a permanent Author Key to each pen name, set per-role rules for co-authors and proofreaders, and fill commercial or publisher release fields.',
    audience: 'Co-authors, proofreaders, editors, typesetters, and publishers',
    lessons: [
      {
        id: 'm9-permkey',
        title: 'Bind One Permanent Author Key to Each Pen Name',
        durationMin: 4,
        instruction:
          'Open Book Library (bookshelf icon) or Studio -> Publish, enter your Pen Name, and click Create Permanent Author Key. Once created, that Author Key stays tied forever to that pen name.',
        objective: 'Protect author identity across editions and catch any attempt to swap your key inside exported files.',
        concepts: [
          'Every pen name receives its own single `QVK-...` Author Key stored locally in your permanent pen-name registry. You cannot replace or rotate that key once bound—guaranteeing every book published under that pen name matches the same cryptographic fingerprint.',
          'Quillvibe also stores the Author Key fingerprint in the sealed header of `QVBX` files. If someone edits the JSON inside a file to swap in a different pen name key, Quillvibe flags Author Key tampering immediately and blocks opening.',
        ],
        steps: [
          'Open Library -> check the Pen Name box while no key is set yet.',
          'Click Create Permanent Author Key -> observe the green Locked Forever to Pen Name badge.',
          'Click Sign & Seal Book to stamp the manuscript digest with that key.',
        ],
        example: {
          heading: 'Writing Under Two Pen Names',
          body: 'Use your thriller pen name on Book A (receiving its own forever key) and create a separate book for your romance pen name—each pen name keeps its own distinct permanent key.',
        },
        proTip:
          'Decide the exact spelling of your Pen Name before creating its permanent key, since the pen name locks alongside the key.',
        checkpoint: {
          question: 'Why cannot an author key be changed once created for a pen name?',
          options: [
            'So readers, collaborators, and publishers can trust that every book under that pen name comes from the same original key',
            'Because the button runs only once per computer reboot',
            'So nobody can read Chapter 1',
          ],
          correctIndex: 0,
          explanation:
            'Keeping one forever key per pen name prevents key swaps and impersonation across releases.',
        },
        actionLabel: 'Open Author Key View',
        minTier: 'advanced',
        targetView: 'typeset',
        targetTypesetTab: 'publish',
      },
      {
        id: 'm9-perms',
        title: 'Set Collaborator Roles & Access Restrictions',
        durationMin: 5,
        instruction:
          'Open Collaborate (Advanced tier) to add Co-Authors, Proofreaders, Editors, Typesetters, Publishers, or Beta Readers, and check or uncheck exact capabilities under each person.',
        objective: 'Give teammates the tools they need while locking prose edits, exports, or Author Keys when needed.',
        concepts: [
          'Not everyone touching a book should have the same buttons unlocked. A Proofreader or Beta Reader gets Proofread marks & notes enabled by default while Edit prose stays turned off—switching Manuscript Draft view into a calm read-only sheet with a direct switch to Proofread Mode.',
          'Collaborators can never alter the book owner’s permanent Author Key, and you can toggle six clear permissions per collaborator: Edit prose, Proofread marks & notes, Edit Bible & Graph, Edit Cover & Typeset, Export files, and Manage team.',
        ],
        steps: [
          'Open Collaborate from the top bar and switch Active Editor / Reviewer Role or add a new collaborator.',
          'Pick a role (for example Proofreader or Typesetter) to apply safe default rules.',
          'Check or uncheck any individual permission checkbox on the collaborator card to tailor access.',
        ],
        example: {
          heading: 'Locking Drafts During Final Proofreading',
          body: 'Add your copyeditor with Edit prose unchecked and Proofread marks & notes checked. They can place margin notes and mark typos without changing your finished sentences.',
        },
        proTip:
          'Typesetter role defaults allow Cover & Typeset work and exporting files while keeping prose read-only.',
        checkpoint: {
          question: 'What happens in Manuscript Editor when a collaborator has Edit prose unchecked?',
          options: [
            'The writing sheet switches to read-only and displays a banner linking straight to Proofread Mode',
            'The book deletes itself',
            'The theme turns bright red',
          ],
          correctIndex: 0,
          explanation:
            'Quillvibe keeps the manuscript safe in read-only mode while allowing permitted proofread marks and notes.',
        },
        actionLabel: 'Open Editor View',
        minTier: 'advanced',
        targetView: 'editor',
        targetSelector: '.bv-topbar-actions',
      },
      {
        id: 'm9-enterprise',
        title: 'Commercial & Publisher Release Options',
        durationMin: 4,
        instruction:
          'Open Settings -> Publishing & Archive to set Publisher Legal Entity, eBook ISBN, Rights Territory, Commercial License, BISAC Code, Press Embargo Date, ARC Proof Watermark, and Enterprise safety rules.',
        objective: 'Prepare professional publishing records, review-copy watermarks, and company release policies.',
        concepts: [
          'Commercial presses and studio teams track more than one print ISBN. Publishing & Archive lets you store your legal company name, separate Print and eBook ISBNs, territorial distribution rights (for example World All Languages), licensing terms, BISAC category codes, and embargo/street dates—exported cleanly inside your Editorial Handoff Sheet.',
          'Adding an Advance Review Copy (ARC) watermark stamps a diagonal light label across Printable Typeset HTML pages, while turning on Require password on every QVBX file export enforces password entry on every `.qv` export.',
        ],
        steps: [
          'Open Settings -> Publishing & Archive.',
          'Fill your Imprint, Publisher Legal Entity, Print/eBook ISBN, and Rights Territory.',
          'Optionally enter an ARC Proof Watermark or turn on Require valid Author Key signature / Require password on export.',
        ],
        example: {
          heading: 'Advance Review Proofs',
          body: 'Type "ADVANCE REVIEW COPY — NOT FOR SALE" into Printable ARC Watermark, then print your PDF proof for early reviewers.',
        },
        proTip:
          'Check Studio -> Publish Readiness anytime to confirm your Commercial / Publisher Release Info check turns green.',
        checkpoint: {
          question: 'Where does Printable ARC Watermark text show up when configured?',
          options: [
            'As a subtle diagonal watermark across Printable / Print PDF book pages',
            'Inside every scene word count counter',
            'Only inside browser console logs',
          ],
          correctIndex: 0,
          explanation:
            'Printable Typeset HTML overlays the configured ARC watermark safely on each printed proof page.',
        },
        actionLabel: 'Check Publish Readiness',
        minTier: 'advanced',
        targetView: 'typeset',
        targetTypesetTab: 'publish',
      },
    ],
  },
  {
    id: 'mod-desktop',
    number: 10,
    title: 'Desktop App Extras (Windows, macOS & Linux)',
    summary:
      'Learn what extra tools appear only in the installed desktop app: F11 Immersive HUD, parallel book windows, local Wi-Fi/Bluetooth sync, and OS file double-clicking.',
    audience: 'Writers comparing Web Studio vs the Desktop Installer',
    lessons: [
      {
        id: 'm10-hud-win',
        title: 'Immersive Fullscreen HUD (F11) & Multi-Window Editing',
        durationMin: 3,
        instruction:
          'On the desktop app, press F11 (or click Fullscreen) for edge-to-edge focus with a floating clock/sprint/word/alarm bar, or click Window in Book Library to edit two books in separate windows.',
        objective: 'Keep browser screens uncluttered while mastering the extra desktop-only controls.',
        concepts: [
          'Web browsers cannot turn every tab into a clean multi-window OS studio or bypass browser fullscreen banners reliably. Because of that, Quillvibe keeps web browsers clean by hiding desktop-only buttons there and showing them strictly inside the Windows, macOS, and Linux app.',
          'Inside the desktop app, Fullscreen mode gives you a custom floating status strip showing wall clock, sprint timer, word progress, and your Alarm Clock chime, while New Window launches any second book from your library side by side on dual monitors.',
        ],
        steps: [
          'Notice on web (`quillvibe.jhonrey.com`) that desktop-only buttons stay hidden so mobile and desktop browsers never glitch.',
          'Install the Desktop App from Releases when you want F11 Immersive Fullscreen and side-by-side book windows.',
          'Toggle which Immersive HUD widgets appear in Settings -> Workspace & Editor inside the desktop app.',
        ],
        example: {
          heading: 'Dual-Monitor Trilogy Editing',
          body: 'In the desktop app, keep Book 1 open in your left monitor window while drafting Book 2 in your right monitor window.',
        },
        proTip:
          'Web users still get full Zen Focus (`Ctrl+Shift+F`), all themes, Cover Studio, Typeset, EPUB 3, Print PDF, QVBX passwords, and the Sprint/Alarm Clock.',
        checkpoint: {
          question: 'Why does the website version hide the F11 Immersive Fullscreen and Multi-Window buttons?',
          options: [
            'So web layouts stay clean and unbroken across phones and desktop browsers while desktop-only controls live inside the desktop app',
            'Because writing courses are web-only',
            'To disable saving in browsers',
          ],
          correctIndex: 0,
          explanation:
            'Desktop OS features are shown only in the compiled desktop runtime so the website stays lightweight and reliable on every screen.',
        },
        actionLabel: 'View Practice Sheet',
        minTier: 'basic',
        targetView: 'editor',
        targetSelector: '.bv-statusbar',
      },
      {
        id: 'm10-lan-os',
        title: 'Local Wi-Fi LAN Sync, Bluetooth Transfer & File Double-Click',
        durationMin: 3,
        instruction:
          'In the desktop app, open Collaborate for Same-Wi-Fi PIN Sync and Bluetooth Receive/Send, or open Extensions -> File Formats to register `.qv`, `.qvbible`, `.qvscene`, and `.qvstyle` with Explorer or Finder.',
        objective: 'Sync over local Wi-Fi without cloud accounts and launch books straight from your file manager.',
        concepts: [
          'Same-Wi-Fi LAN Sync starts a local HTTP server bound strictly to your private LAN subnet with a 6-digit PIN (`X-Quillvibe-Pin`), allowing two writers in the same room to exchange revisions without internet access. On web, Collaborate automatically switches to show Team Permissions and HTTPS Enterprise / Website Sync cleanly.',
          'OS Shell registration lets Windows Explorer, macOS Finder, and Linux desktops launch Quillvibe when double-clicking `.qv`, `.qvbible`, `.qvscene`, or `.qvstyle` files. In Fullscreen (`F11`), the movable Immersive HUD can also collapse or reveal from the top screen hover bar.',
        ],
        steps: [
          'In the desktop app, open Collaborate -> Same-Wi-Fi LAN Sync to start hosting with a 6-digit PIN.',
          'Share the local IP:port and PIN verbally with your co-author on the same Wi-Fi router.',
          'Register `.qv` file associations once under Extensions -> File Formats -> Register in OS Shell.',
        ],
        example: {
          heading: 'Air-Gapped Co-Writing Retreat',
          body: 'Turn off internet Wi-Fi, connect both laptops to a travel router, and merge scenes safely via 6-digit PIN LAN sync.',
        },
        proTip:
          'On the web version, use signed/password-locked `.qv` downloads or Enterprise HTTPS Website Sync to share files safely.',
        checkpoint: {
          question: 'Which collaboration methods work directly inside the web browser without installing the desktop app?',
          options: [
            'Team roles & permissions, `.qv` file merge, and HTTPS Enterprise / Website Sync',
            'Raw local TCP Wi-Fi server hosting',
            'Windows Registry editing from a web tab',
          ],
          correctIndex: 0,
          explanation:
            'Browser mode supports collaborator permissions, manual `.qv` merges, and TLS Enterprise / Website Sync, while raw LAN sockets and OS shell hooks run in the desktop app.',
        },
        actionLabel: 'Back to Course Overview',
        minTier: 'basic',
        targetView: 'course',
      },
    ],
  },
  {
    id: 'mod-scene-craft',
    number: 11,
    title: 'Scene Craft, Pacing & Narrative Tension',
    summary:
      'Structure scenes around a clear goal, rising complications, and a quiet turn at the close using Binder cards and Word Targets.',
    audience: 'Fiction and narrative nonfiction writers shaping chapter flow',
    lessons: [
      {
        id: 'm11-goal-turn',
        title: 'Goal, Obstacle & Turn Inside Every Scene',
        durationMin: 5,
        instruction:
          'Give each active scene a concrete short-term goal in the Scene Inspector Synopsis and verify the ending shifts what your character knows or risks.',
        objective: 'Prevent drifting chapters by anchoring every scene to a clear question and turn.',
        concepts: [
          'Chapters lose momentum when characters walk into a room, talk pleasantly, and leave with nothing changed. A durable scene opens with an immediate objective—deliver a chart before high water, find a missing ledger, or talk down a panicking witness—and closes only after that situation tilts.',
          'Writing a two-sentence synopsis in the Scene Inspector before drafting gives you a compass. When dialogue wanders, one glance at the Inspector reminds you what must break or shift before the scene ends.',
        ],
        steps: [
          'Select your active scene in the Manuscript Binder and open the Scene Inspector on the right.',
          'Write one sentence for the scene Goal and one sentence for the ending Turn inside Synopsis.',
          'Draft directly on the page until you reach that shift, then stop cleanly instead of padding the exit.',
        ],
        example: {
          heading: 'Harbor Scene Turn',
          body: 'Opening goal: Convince the harbor master to sign the departure bond before fog closes the bell buoy. Ending turn: The bond is signed, but only because the harbor master swaps one crew member for his own informant.',
        },
        proTip:
          'If a scene synopsis takes five lines to explain, the scene is usually trying to hold two separate moments. Split it with Split Scene.',
        checkpoint: {
          question: 'Where should you record the short two-sentence Goal and Turn before drafting?',
          options: [
            'In the Scene Inspector Synopsis field beside your active sheet',
            'Inside the Export ISBN box in Settings',
            'As a filename suffix when saving .qvstyle presets',
          ],
          correctIndex: 0,
          explanation:
            'The Scene Inspector Synopsis travels with the scene card on Corkboard and Outline Ledger without cluttering your manuscript prose.',
        },
        actionLabel: 'Open Manuscript & Inspector',
        minTier: 'basic',
        targetView: 'editor',
        targetSelector: '.bv-inspector',
      },
      {
        id: 'm11-pacing-ratios',
        title: 'Balancing Action Scenes With Quiet Sequels in Outline',
        durationMin: 4,
        instruction:
          'Switch to Outline Ledger and alternate fast high-tension scenes with short reflective scenes so the middle of the book breathes.',
        objective: 'Spot rushed stretches or slow patches across an entire act at one glance.',
        concepts: [
          'Readers tire quickly when every chapter is a chase, and drift when five consecutive chapters sit at breakfast tables thinking about yesterday. Strong books pair fast scene Confrontations with shorter Sequel scenes where characters weigh fallout and pick a next move.',
          'Outline Ledger shows every scene status, POV, location, and exact word count row by row. Looking at word-count rhythm across Part I and Part II shows immediately whether an act needs tightening or room to land.',
        ],
        steps: [
          'Open Outline from the top navigation bar (Editorial or Full Studio layout).',
          'Scan the word count and timeline columns across a single Part or chapter arc.',
          'Tag high-tension turns vs. quiet reaction scenes in Synopsis or Status so gaps stand out immediately.',
        ],
        example: {
          heading: 'Act Two Midpoint Check',
          body: 'Three 3,200-word storms back-to-back? Insert a 650-word harbor-dock watch scene where characters repair gear and quietly argue what the cost was.',
        },
        proTip:
          'Exporting an Outline CSV lets you print a one-page beat sheet for margin pencil notes away from screens.',
        checkpoint: {
          question: 'Which workspace gives a single table of word counts, POVs, timelines, and statuses across your book?',
          options: [
            'Outline Ledger',
            'Book Cover Studio Layers',
            'Font Uploader',
          ],
          correctIndex: 0,
          explanation:
            'Outline Ledger lists every chapter and scene in a filterable spreadsheet table for pacing and continuity audits.',
        },
        actionLabel: 'Open Outline Ledger',
        minTier: 'intermediate',
        targetView: 'outline',
        targetSelector: '.bv-outline-scroll',
      },
      {
        id: 'm11-opening-hooks',
        title: 'Opening Late, Leaving Early & Trimming Throat-Clearing',
        durationMin: 4,
        instruction:
          'Use Proofread Copyediting Marks and Snapshots to test starting your opening scene on paragraph four instead of paragraph one.',
        objective: 'Cut warmup paragraphs safely while keeping original lines backed up in Snapshots.',
        concepts: [
          'Writers often warm up during the first three paragraphs of a morning session—describing weather, waking up, or repeating yesterday’s facts—before the central conflict begins on paragraph four. Once the scene is alive, those warmup lines slow down the reader’s entrance.',
          'Taking a Revision Snapshot before pruning lets you mark cuts with zero fear: you can restore or inspect the deleted opening anytime in Revision Diff.',
        ],
        steps: [
          'Click Snapshot in the top editor subbar to save a clean copy of the scene before cutting.',
          'Switch to Proofread mode and highlight the opening warmup lines, right-clicking to apply a Delete mark.',
          'Toggle Clean Preview to read straight from the stronger fourth paragraph onward.',
        ],
        example: {
          heading: 'Cutting Morning Arrival Lines',
          body: 'Cut two paragraphs about walking down wet granite steps and start with: "Three ships had already slipped their chains before the harbor clock struck five."',
        },
        proTip:
          'Always compare before and after in Diff mode after trimming a scene ending—the last spoken line is often stronger when left alone without an extra summary sentence.',
        checkpoint: {
          question: 'What keeps a recoverable copy of trimmed opening paragraphs before accepting Proofread deletions?',
          options: [
            'Saving a scene Snapshot (or automatic backup snapshot)',
            'Clearing local browser storage',
            'Switching themes to Obsidian',
          ],
          correctIndex: 0,
          explanation:
            'Snapshots store immutable copies of any scene draft inside your .qv book file so nothing is ever lost when pruning.',
        },
        actionLabel: 'Open Proofread Mode',
        minTier: 'intermediate',
        targetView: 'editor',
        targetSelector: '.bv-prose-textarea',
      },
    ],
  },
  {
    id: 'mod-dialogue',
    number: 12,
    title: 'Dialogue Craft, Voice & Subtext',
    summary:
      'Keep spoken exchanges sharp, distinguish speakers without name clutter, and compare voice revisions in Split View.',
    audience: 'Writers polishing character voice and dramatic dialogue',
    lessons: [
      {
        id: 'm12-subtext',
        title: 'Saying One Thing While Protecting Another',
        durationMin: 4,
        instruction:
          'Track each speaker’s hidden motive in Story Bible notes and open that character beside your manuscript in Split View.',
        objective: 'Replace blunt on-the-nose speeches with terse dialogue shaped by character agendas.',
        concepts: [
          'Dialogue stalls when two speakers state facts strictly for the reader’s benefit ("As you know, Captain, my brother drowned last winter"). Real speakers rarely explain what both of them already know; they deflect, steer around sore topics, or ask small practical questions about larger fears.',
          'Keeping a Character’s private secret open in Split View beside your prose editor keeps every line tethered to what that character refuses to admit out loud.',
        ],
        steps: [
          'Add a brief "Private Agenda / Will Not Admit" note inside your character’s Story Bible entry.',
          'Open Manuscript -> Split View and select that Character entry in the side reference pane.',
          'Rewrite flat explanatory lines so each character presses toward a practical want while guarding that secret.',
        ],
        example: {
          heading: 'Indirect Exchange',
          body: 'Instead of "I am worried you will lose the ship," write: "How many spare lanterns did you pack? Because the northern shoal has no keeper this month."',
        },
        proTip:
          'Read long conversations aloud in Typewriter focus—if you run out of breath mid-sentence, trim subordinate clauses.',
        checkpoint: {
          question: 'How can you view a character’s private Story Bible notes right beside your scene while rewriting dialogue?',
          options: [
            'Select Split View in the Manuscript subbar and pick that character as the reference pane',
            'Export the book to EPUB after every sentence',
            'Rename the chapter title to the character’s motive',
          ],
          correctIndex: 0,
          explanation:
            'Split View displays any Story Bible card or another scene alongside your live draft without leaving the editor.',
        },
        actionLabel: 'Open Manuscript Split Mode',
        minTier: 'basic',
        targetView: 'editor',
        targetSelector: '.bv-editor-panes',
      },
      {
        id: 'm12-beats-tags',
        title: 'Clean Dialogue Tags & Physical Action Beats',
        durationMin: 3,
        instruction:
          'Replace repetitive adverbial tags with concise physical beats and simple "said"/"asked" punctuation in Draft mode.',
        objective: 'Keep attribution invisible so reader attention stays on speech cadence and gesture.',
        concepts: [
          'Visible stage directions like "he hissed angrily" or "she exclaimed thoughtfully" interrupt pacing and duplicate emotion the line should already carry. Quiet tags ("said", "asked") disappear on the page, while short physical beats anchor where characters stand and what their hands are doing.',
          'When more than two speakers share a room, alternate dialogue lines with brief concrete actions so readers never need to count back up the page to identify who spoke.',
        ],
        steps: [
          'Scan one finished conversation page in your active scene.',
          'Replace ornate speech verbs and adverb tags with plain "said" or cut the tag completely when two speakers alternate.',
          'Anchor key pauses with small prop beats—folding a map, setting down a cup, wiping spectacles.',
        ],
        example: {
          heading: 'Before & After Tag Trim',
          body: 'Before: "Leave the manifest here," he barked coldly. After: He laid a paperweight across the manifest. "Leave it."',
        },
        proTip:
          'Interior Typeset smart quotes automatically format straight apostrophes and opening/closing quotation marks when exporting print PDF and EPUB.',
        checkpoint: {
          question: 'Why do experienced editors prefer simple "said" tags mixed with brief action beats?',
          options: [
            'Plain tags stay nearly invisible so speech cadence and gesture carry the emotion cleanly',
            'Printer ink costs more for longer verbs',
            'Action beats disable spellcheck automatically',
          ],
          correctIndex: 0,
          explanation:
            'Minimal attribution avoids melodrama and keeps reader immersion centered on the speakers.',
        },
        actionLabel: 'Draft Dialogue Scene',
        minTier: 'basic',
        targetView: 'editor',
        targetSelector: '.bv-prose-textarea',
      },
      {
        id: 'm12-voice-cadence',
        title: 'Distinguishing Character Voices Without Dialect Spelling',
        durationMin: 4,
        instruction:
          'Cover speaker names during revision and check whether syntax length, favored nouns, and blind spots distinguish each character.',
        objective: 'Create recognizable voices through word choice and sentence rhythm rather than heavy phonetic spellings.',
        concepts: [
          'Phonetic misspellings ("wuz", "git", "dunno") slow reading speed and quickly look cartoonish. Distinct voice lives in what someone notices first, whether they answer questions directly or tell short stories, and whether they speak in four-word fragments or careful qualified clauses.',
          'A surveyor notices drainage, sightlines, and brass fittings; a cook notices fuel, freshness, and knife wear. Logging each character’s speech rhythm and profession vocabulary in Story Bible prevents voices from blurring together in Chapter Twelve.',
        ],
        steps: [
          'Open Story Bible -> Characters and record a short "Speech Rhythm & Blind Spots" line per lead character.',
          'Pick a tense conversation in Manuscript and read each character’s spoken lines back-to-back.',
          'Tighten filler greetings and swap generic nouns for words rooted in each character’s craft.',
        ],
        example: {
          heading: 'Contrasting Two Vocabularies',
          body: 'Character A speaks in ledger quantities ("short by twelve shillings, due Friday"); Character B speaks in weather and tide ("two hours left on the ebb").',
        },
        proTip:
          'Use Proofread Substitute marks during pass two strictly to tune a single character’s voice across three chapters in one sweep.',
        checkpoint: {
          question: 'What distinguishes two characters’ spoken voices more cleanly than heavy phonetic misspellings?',
          options: [
            'Sentence rhythm, profession vocabulary, and what each speaker avoids mentioning',
            'Setting every character line in italics',
            'Using exclamation marks after every sentence',
          ],
          correctIndex: 0,
          explanation:
            'Authentic voice comes from cadence, worldview, and word choice rather than distracting spelling.',
        },
        actionLabel: 'Open Story Bible Characters',
        minTier: 'advanced',
        targetView: 'bible',
        targetSelector: '.bv-bible-layout',
      },
    ],
  },
  {
    id: 'mod-series-world',
    number: 13,
    title: 'Series Continuity & Cross-Linked Worldbuilding',
    summary:
      'Use [[wikilinks]], #tags, custom Story Bible categories, and Story Graph Auto-Sync to hold trilogies and complex settings together.',
    audience: 'Authors writing multi-POV novels, historical fiction, or series',
    lessons: [
      {
        id: 'm13-wikilinks-sync',
        title: 'Two-Way Prose Links With [[Wikilinks]] & Story Graph Auto-Sync',
        durationMin: 4,
        instruction:
          'Reference Story Bible names inside scenes with [[Name]] or plain mentions, then toggle Auto-Sync Book inside Story Graph.',
        objective: 'Trace where characters, items, and subplots intersect without maintaining manual spreadsheets.',
        concepts: [
          'As manuscripts pass 60,000 words, remembering whether a minor witness visited a warehouse in Chapter Three or Chapter Seven becomes fragile. Quillvibe detects character and place mentions automatically and pairs two-way Auto-Sync between chapters and the Story Graph.',
          'Turning on Auto-Sync Book updates node links directly from scene references so your Spatial Storyboard or Force Graph mirrors real manuscript ties.',
        ],
        steps: [
          'Switch to Full Studio layout and open Story Graph.',
          'Enable Auto-Sync Book in the Story Graph toolbar to wire scenes to linked characters and places.',
          'Inspect shortest narrative paths in Force Graph to check whether two plot threads collide early enough.',
        ],
        example: {
          heading: 'Checking a Clue Path',
          body: 'Notice in Force Graph that a key compass is mentioned in Chapter One and Chapter Nine with zero intermediate nodes—time to plant a passing mention in Chapter Five.',
        },
        proTip:
          'Story Graph also imports and exports standard .canvas JSON diagrams if you sketch boards elsewhere.',
        checkpoint: {
          question: 'What does Auto-Sync Book do inside Story Graph?',
          options: [
            'Synchronizes scene references and Story Bible connections automatically with graph nodes and edges',
            'Uploads your manuscript to public social feeds',
            'Locks all chapters from editing',
          ],
          correctIndex: 0,
          explanation:
            'Auto-Sync keeps Story Graph topology aligned with your live chapters and Story Bible entries.',
        },
        actionLabel: 'Open Story Graph',
        minTier: 'advanced',
        targetView: 'graph',
        targetSelector: '.bv-graph-layout',
      },
      {
        id: 'm13-custom-categories',
        title: 'Custom Bible Categories for Factions, Ships, Magic & Calendars',
        durationMin: 3,
        instruction:
          'Add project-specific Story Bible categories and shareable .qvbible worldbooks for multi-book series.',
        objective: 'Organize domain rules—ships, guilds, historical laws, or dialects—cleanly alongside characters.',
        concepts: [
          'Not every world fits strictly inside Characters, Locations, and Lore. Maritime fiction needs vessel logs, court mysteries need trial statutes, and speculative series need system limits. Custom Story Bible categories keep specialized rules searchable without stuffing unrelated details into character bios.',
          'Exporting a .qvbible file extracts only your Story Bible knowledge base so you can import the same world cleanly into Book II.',
        ],
        steps: [
          'Open Story Bible and click the New Category action to create a custom shelf (e.g. Vessels or Guilds).',
          'Add key entries with reference portraits and custom metadata fields.',
          'Export as .qvbible in Settings -> Export or top bar to preserve a standalone series bible.',
        ],
        example: {
          heading: 'Series Bible Reuse',
          body: 'Finish Book I, export World-of-Narrows.qvbible, start a fresh .qv file for Book II, and import the .qvbible without copying Chapter One prose.',
        },
        proTip:
          'You can attach reference photos to any Story Bible card without bloating exported EPUB interiors.',
        checkpoint: {
          question: 'Which native Quillvibe file exports only Characters, Locations, Lore, and custom Bible shelves?',
          options: ['.qvbible', '.qvstyle', '.qvdesign'],
          correctIndex: 0,
          explanation:
            '.qvbible stores and merges Story Bible notes across books independently of scene prose.',
        },
        actionLabel: 'Open Story Bible',
        minTier: 'advanced',
        targetView: 'bible',
        targetSelector: '.bv-bible-list',
      },
      {
        id: 'm13-series-lock',
        title: 'Locking Finalized Chapters & Separating Continuity Notes',
        durationMin: 3,
        instruction:
          'Lock completed Part I chapters in the Binder once continuity is verified so later rewrites never break settled canon.',
        objective: 'Prevent accidental typos or deletions in finished front chapters while revising the ending.',
        concepts: [
          'When rushing late-book revisions, an errant Ctrl+V or wrong-tab edit can quietly corrupt an already proofread early chapter. Locking settled chapters or full Parts inside the Binder puts them safely in read-only mode while still letting you view them in Split View and include them in exports.',
          'Combined with Author Keys and Copyright Seals, your settled canon remains protected across long multi-month drafts.',
        ],
        steps: [
          'Verify your settled Part or Chapter prose in Proofread mode.',
          'Click the Lock icon beside that Chapter or Part in the Manuscript Binder (or right-click -> Lock).',
          'Unlock anytime with one click if a later plot discovery genuinely requires an earlier adjustment.',
        ],
        example: {
          heading: 'Safe Sequel Prep',
          body: 'Lock all chapters in Book I right before drafting Book II so opening Book I for reference never introduces accidental keystrokes.',
        },
        proTip:
          'Pair Binder chapter locking with password-locked .qv backups when sending manuscripts to external beta readers.',
        checkpoint: {
          question: 'Can a locked chapter still be viewed in Split Reference and included in EPUB/PDF exports?',
          options: [
            'Yes — locking prevents accidental text edits while keeping reading and exporting active',
            'No — locked chapters are removed from exports',
            'Only inside Obsidian theme',
          ],
          correctIndex: 0,
          explanation:
            'Chapter locks protect settled prose from unintended edits without excluding those pages from your book.',
        },
        actionLabel: 'Check Binder Locks',
        minTier: 'basic',
        targetView: 'editor',
        targetSelector: '.bv-binder',
      },
    ],
  },
  {
    id: 'mod-prepress',
    number: 14,
    title: 'Cover Typography, Print Prepress & Release Checks',
    summary:
      'Audit thumbnail legibility, trim bleed math, spine width, and full export checklists before sending a book to printers or stores.',
    audience: 'Self-publishing authors and small-press production editors',
    lessons: [
      {
        id: 'm14-cover-thumb',
        title: 'Thumbnail Legibility & Spine Hierarchy on Book Covers',
        durationMin: 4,
        instruction:
          'Zoom out to 25% in Book Cover Studio to verify that title contrast and silhouette read at bookstore thumbnail size.',
        objective: 'Ensure cover typography stays readable on phones and small storefront tiles.',
        concepts: [
          'Most readers first see your cover at roughly 160 pixels wide inside a digital catalog before ever holding a full-size hardcover. Ornate thin display type, low-contrast gradients, or busy backgrounds collapse into grey noise at thumbnail scale.',
          'Zooming out to 25%–35% in Cover Studio shows immediately whether title weight, letter spacing, and background value separation pass the three-second squint test.',
        ],
        steps: [
          'Open Studio -> Book Cover Studio and switch zoom down to 25% or 35%.',
          'Check whether the main Title and Author Name stay crisp over artwork across all themes.',
          'Switch to Spine and Back Cover faces to confirm readable author/title orientation and barcode margin.',
        ],
        example: {
          heading: 'Squint Test Fix',
          body: 'If your serif title disappears into ocean spray at 30% zoom, add a subtle dark gradient scrim behind the upper third or boost title contrast instead of adding thick neon strokes.',
        },
        proTip:
          'Use Cover Studio Draft Variants (desktop app) to test two typography pairings and compare them side-by-side before exporting PNG 3x or Print PDF.',
        checkpoint: {
          question: 'Why should you inspect your finished cover at 25%–35% zoom before exporting?',
          options: [
            'To verify that title contrast and hierarchy remain legible at online thumbnail size',
            'Because PDF files cannot hold full-resolution fonts',
            'To delete hidden layers automatically',
          ],
          correctIndex: 0,
          explanation:
            'Most readers discover books at thumbnail scale first; early contrast checks catch thin or crowded typography.',
        },
        actionLabel: 'Open Book Cover Studio',
        minTier: 'advanced',
        targetView: 'typeset',
        targetTypesetTab: 'cover',
        targetSelector: '.qv-studio-stage',
      },
      {
        id: 'm14-prepress-check',
        title: 'Interior Print Audit: Trim Size, Widows, Drop Caps & EPUB Test',
        durationMin: 5,
        instruction:
          'Run through Interior Typeset settings, verify smart quotes and front/back matter, and inspect exported PDF, EPUB 3, and .docx builds.',
        objective: 'Catch pagination surprises, unformatted italics, or missing metadata before upload.',
        concepts: [
          'Print-on-demand printers and digital storefronts reject packages with missing spine width calculations, inconsistent trim dimensions, unclosed smart quotes, or broken table-of-contents headings. Checking both Print PDF pages and a real e-reader test guarantees consistency across print and screen.',
          'Saving your house interior rules as a reusable .qvstyle file lets every book in a trilogy share identical margins, numerals, headers, and typography.',
        ],
        steps: [
          'Open Studio -> Interior Typeset and verify Trim Size (for example 6x9 trade or 5.5x8.5), margins, and Running Header text.',
          'Open Studio -> Publish & Export to inspect live pagination, ISBN, and Publisher Name.',
          'Export Print PDF, EPUB 3, and .docx, then open each file in an external reader to spot-check Chapter One and Back Matter.',
        ],
        example: {
          heading: 'Final Pre-Release Run',
          body: 'Export PDF -> check page numbers and margins. Export EPUB -> check chapter links and cover thumbnail. Export .qv -> store offline archival copy with Author Key.',
        },
        proTip:
          'Save a locked .qv master file alongside your final Print PDF so you always retain source prose, cover layers, and proofread history.',
        checkpoint: {
          question: 'Which native file saves your reusable trim size, typography, and margin layout for future books?',
          options: ['.qvstyle', '.qvbible', '.qvext'],
          correctIndex: 0,
          explanation:
            '.qvstyle stores print trim dimensions, margins, typography, drop caps, and paper preset rules cleanly.',
        },
        actionLabel: 'Open Interior Typeset',
        minTier: 'intermediate',
        targetView: 'typeset',
        targetTypesetTab: 'interior',
        targetSelector: '.bv-typeset-layout',
      },
      {
        id: 'm14-archive-key',
        title: 'Author Keys, Copyright Seals & Clean Archival Backups',
        durationMin: 3,
        instruction:
          'Verify your Origin Author Key and Work Copyright Seal in Library & Publish, and keep redundant offline .qv copies.',
        objective: 'Ensure long-term ownership records and recoverable backups stay independent of any single platform.',
        concepts: [
          'Every book should live in more than one place before release day. Keeping a signed, optionally password-locked .qv master archive alongside open .docx and .md exports ensures you can reopen or convert your manuscript decades later regardless of shifting cloud services.',
          'Your Origin Author Key and Work Copyright Seal embed verifiable authorship metadata and rights territory right inside the exported archive.',
        ],
        steps: [
          'Open Library -> Author Identity to verify your Pen Name and local Origin Author Key.',
          'Open Studio -> Publish & Export -> Seals & Keys to confirm ISBN, edition year, and Work Copyright Seal.',
          'Click Save -> .qv (with an optional password for sensitive unreleased manuscripts) and store a copy on an offline drive.',
        ],
        example: {
          heading: '3-2-1 Author Backup Rule',
          body: 'One working .qv on your primary laptop, one encrypted .qv copy on a USB SSD, and one export bundle (.pdf + .epub + .docx) dated cleanly.',
        },
        proTip:
          'Use Settings -> Check for Updates (Desktop App) or visit quillvibe.jhonrey.com/help whenever exporting with a new release.',
        checkpoint: {
          question: 'Which Quillvibe format preserves your complete manuscript, Story Bible, Story Graph, cover artwork, and Author Key in one archive?',
          options: ['.qv', '.txt', '.html'],
          correctIndex: 0,
          explanation:
            'The .qv workspace container keeps every part of your book project unified and optionally password-encrypted.',
        },
        actionLabel: 'Open Publish & Export',
        minTier: 'intermediate',
        targetView: 'typeset',
        targetTypesetTab: 'publish',
        targetSelector: '.bv-typeset-layout',
      },
    ],
  },
  {
    id: 'mod-ms-deep-1',
    number: 15,
    track: 'manuscript',
    title: 'Manuscript Workspace 101: Architecture & Draft Environment',
    summary:
      'Foundational university seminar on Quillvibe’s three-column Manuscript architecture: Parts/Chapters/Scenes hierarchy, paper ergonomics, and focus geometry.',
    audience: 'Writers mastering long-form book organization from zero to clean draft',
    lessons: [
      {
        id: 'm15-binder-tree',
        title: '1.1 Binder Hierarchy: Parts, Chapters, Scenes & Drag Reordering',
        durationMin: 6,
        instruction:
          'Inspect the left Manuscript Binder, create structured Parts and Chapters, reorder scenes cleanly, and lock finalized chapters from unintended keystrokes.',
        objective: 'Architect multi-act book manuscripts cleanly without splitting chapters into stray files.',
        concepts: [
          'Long-form writing breaks down quickly inside flat single-document word processors once manuscripts cross 20,000 words: scrolling becomes slow, chapter headings shift unintentionally, and moving a scene across acts takes brittle cut-and-paste operations. Quillvibe separates book macro-structure into a deterministic three-tier hierarchy: Part -> Chapter -> Scene.',
          'Parts serve as thematic or structural volumes (Act I, Part II, Appendix). Chapters establish numbered print breaks in Typeset and EPUB table-of-contents exports. Scenes remain modular drafting tiles that tally independent word targets in the Scene Inspector while accumulating live rollups up to Chapter and whole-Book word counts in the bottom status bar.',
          'Each column divider (<->) between the Binder, Paper Sheet, and Inspector drags smoothly to match your monitor width, while viewports narrower than 1180px automatically collapse the opposite drawer so your active writing sheet never gets crushed.',
        ],
        steps: [
          'Click "+ Part" and "+ Ch" at the top of the Manuscript Binder to scaffold an Act/Part and Chapter container.',
          'Drag the vertical <-> border between the Binder and Paper Sheet to tune your sidebar reading width (190px to 440px).',
          'Hover any completed Chapter or Part and toggle its Lock icon once edits settle to make those scenes read-only until unlocked.',
          'Watch the bottom status bar tally Scene words, Chapter total, Book progress, estimated printed pages, and reading time in real time.',
        ],
        example: {
          heading: 'Four-Part Historical Novel Skeleton',
          body: 'Part I — Low Water (Chapters 1–4) -> Part II — Equinoctial Bore (Chapters 5–10) -> Part III — Copperplate Soundings (Chapters 11–16) -> Epilogue.',
        },
        proTip:
          'Double-click any vertical <-> column resizer handle anytime to snap Binder or Inspector widths straight back to factory proportions.',
        checkpoint: {
          question: 'What is the three-tier structural hierarchy inside the Quillvibe Manuscript Binder?',
          options: [
            'Part -> Chapter -> Scene',
            'Folder -> Canvas -> Layer',
            'Book -> Paragraph -> Sentence',
          ],
          correctIndex: 0,
          explanation:
            'Quillvibe organizes manuscripts as Parts containing Chapters containing modular Scenes so reordering and word tracking stay predictable.',
        },
        actionLabel: 'Inspect Binder Column',
        minTier: 'basic',
        targetView: 'editor',
        targetEditorSubMode: 'draft',
        targetSelector: '.bv-binder',
      },
      {
        id: 'm15-binder-rename',
        title: '1.2 Naming & Renaming Parts and Chapters in the Left Binder',
        durationMin: 4,
        instruction:
          'Give every Part division and Chapter heading an intentional title directly inside the left Manuscript Binder.',
        objective: 'Rename Parts and Chapters cleanly in place so running headers, breadcrumbs, and tables of contents stay accurate.',
        concepts: [
          'New Parts ("Part 2") and new Chapters ("Chapter 2") receive sequential default labels when created with "+ Part" or "+ Ch". Replacing placeholder labels early keeps scene navigation clear inside the left Binder and updates the top paper breadcrumb above every scene.',
          'Quillvibe gives you three ways to rename any Part or Chapter in the left-side Binder: double-click the title directly, click the small quill rename icon that appears when hovering the row, or right-click the row and select "Rename Part" or "Rename Chapter". Press Enter to save or Esc to cancel.',
          'Locked Parts and locked Chapters block accidental renames as well as text edits. Toggle the row’s Lock icon off before renaming finalized sections, then lock them again afterward. Updated names flow automatically into Interior Typeset running headers, Print PDFs, and EPUB tables of contents.',
        ],
        steps: [
          'Double-click any Part label or Chapter title in the left Manuscript Binder to open the inline rename field.',
          'Alternatively, hover a Part or Chapter row and click its quill Rename button, or right-click -> Rename Part / Rename Chapter.',
          'Type the updated title (for example, "Part I — Low Water" or "The Brass Astrolabe") and press Enter to save.',
          'Switch back to your active Scene sheet and verify the updated Part and Chapter names appear in the top paper eyebrow header.',
        ],
        example: {
          heading: 'Clear Narrative Divisions',
          body: 'Renaming "Part 1" -> "Part I — Low Water" and "Chapter 1" -> "The Brass Astrolabe" updates every scene eyebrow, Corkboard group, and EPUB TOC entry automatically.',
        },
        proTip:
          'If a double-click does not open the rename box, check for a small Lock icon beside the row—unlocking a finalized Part or Chapter re-enables renaming.',
        checkpoint: {
          question: 'Which three gestures let you rename a Part or Chapter in the left Manuscript Binder?',
          options: [
            'Double-click its label, click its hover Rename quill icon, or right-click -> Rename Part / Rename Chapter',
            'Delete the chapter and retype every scene from scratch',
            'Edit a manual CSS rule inside Extensions',
          ],
          correctIndex: 0,
          explanation:
            'Inline double-click, the row hover Rename icon, and the row right-click menu all edit Part and Chapter titles cleanly in place.',
        },
        actionLabel: 'Highlight Manuscript Binder',
        minTier: 'basic',
        targetView: 'editor',
        targetEditorSubMode: 'draft',
        targetSelector: '.bv-binder',
      },
      {
        id: 'm15-paper-ergonomics',
        title: '1.3 Paper Themes, Typography Stack & Formatting Without Visual Noise',
        durationMin: 5,
        instruction:
          'Configure Ivory Light, Warm Parchment, or Obsidian Dark paper independently or linked to your studio theme, and format bold, italics, headings, and epigraphs cleanly.',
        objective: 'Establish comfortable typography metrics and low-strain lighting for marathon drafting sessions.',
        concepts: [
          'Visual contrast fatigue comes from two sources: mismatched screen luminance against surrounding studio panels, and overly wide text lines where the eye loses its anchor returning to the left margin. Inside Settings -> Workspace & Editor, Quillvibe constrains the paper sheet measure around classic book proportions (~650px–740px) paired with EB Garamond, Baskerville, Palatino, or any custom .ttf/.otf font.',
          'Unlike cloud note apps crowded with floating slash menus on every keystroke, Draft Mode uses plain Markdown formatting markers (**bold**, *italic*, ## section break, > blockquote, * * * scene break) that export crisply into Print PDF, EPUB 3, and styled .docx documents without proprietary markup lock-in.',
          'Spellcheck underlines remain off by default during first-draft momentum and can be turned on per-studio in Settings when copyediting.',
        ],
        steps: [
          'Open the Paper Theme selector (Ivory / Parchment / Obsidian) on the Draft subbar to test paper contrast independently from your chrome.',
          'Format text directly with Ctrl+B, Ctrl+I, or click B / I / H2 / Quote / * * * in the subbar—or right-click anywhere inside your prose.',
          'Open Settings -> Workspace & Editor -> Link Paper Theme & Application Theme if you want studio theme switching to move paper colors automatically.',
        ],
        example: {
          heading: 'Low-Strain Evening Setup',
          body: 'Use Ivory paper in bright daylight and switch to Parchment (#f7f2e8 warm cream) or Obsidian (#191815 dark charcoal paper) after sunset.',
        },
        proTip:
          'Press Ctrl+Shift+F anytime to hide sidebars and top bars into Zen Focus mode, or F11 in the Desktop App for fullscreen with your floating clock and sprint timer.',
        checkpoint: {
          question: 'Why does Quillvibe use lightweight Markdown markers (**bold**, *italic*, * * *) inside Draft Mode?',
          options: [
            'So drafting stays clean while Print PDF, EPUB 3, and .docx exporters convert formatting consistently with zero vendor lock-in',
            'Because desktop apps cannot export .docx files',
            'To disable undo/redo history',
          ],
          correctIndex: 0,
          explanation:
            'Lightweight semantic syntax keeps prose readable across decades and exports cleanly into print, e-reader, and word-processor formats.',
        },
        actionLabel: 'Inspect Paper Bar',
        minTier: 'basic',
        targetView: 'editor',
        targetEditorSubMode: 'draft',
        targetSelector: '.bv-paper-sheet',
      },
      {
        id: 'm15-sprint-inspector',
        title: '1.4 Scene Inspector Metadata, Sprint Timers & Multi-Window Desks',
        durationMin: 5,
        instruction:
          'Log Scene Synopsis, POV, Location, Timeline, Status, and Word Targets in the right Scene Inspector while pacing daily writing blocks with the Sprint Timer.',
        objective: 'Keep drafting goals and metadata synced directly with Corkboard, Outline Ledger, and Story Graph.',
        concepts: [
          'Every field inside the Scene Inspector—Title, Synopsis, Status (Outline / Draft / Revision / Final), POV Character, Location, Timeline Stamp, and Scene Word Target—populates Corkboard index cards and Outline Ledger spreadsheet columns automatically. Updating POV or Timeline once inside the Inspector updates all structural planning views without duplicate typing.',
          'The bottom Sprint Bar measures live "+Nw" session output against a selectable countdown (15m, 25m, 45m, 60m) paired with configurable gentle audio chime presets via Alarm Preferences.',
        ],
        steps: [
          'Open the right Scene Inspector panel and enter POV, Location, Timeline Stamp, and a Target word count for your active scene.',
          'Pick a sprint length (25m) in the bottom-right Sprint Bar and click Start to track net words written during your sprint.',
          'Notice how Snapshot capture (Camera icon or Ctrl+S) creates point-in-time scene saves before major rewrites.',
        ],
        example: {
          heading: 'Daily Two-Sprint Routine',
          body: 'Two focused 25-minute sprints targeting +450 words each yield ~900 clean words/day—enough for a 75,000-word draft in under three months.',
        },
        proTip:
          'Set custom Scene Targets (e.g., 1,200w for major turning-point scenes, 450w for short bridge scenes) so Corkboard card progress meters accurately reflect intentional pacing.',
        checkpoint: {
          question: 'Where do Scene Inspector fields like POV, Timeline, and Word Target also appear automatically?',
          options: [
            'On Corkboard cards and Outline Ledger columns',
            'Inside external .qvext permission lists only',
            'Only inside cover spine dimensions',
          ],
          correctIndex: 0,
          explanation:
            'Inspector metadata feeds both Corkboard index cards and Outline Ledger rows directly.',
        },
        actionLabel: 'Inspect Scene Inspector',
        minTier: 'basic',
        targetView: 'editor',
        targetEditorSubMode: 'draft',
        targetSelector: '.bv-inspector',
      },
    ],
  },
  {
    id: 'mod-ms-deep-2',
    number: 16,
    track: 'manuscript',
    title: 'Manuscript Workspace 201: Inline Proofreading, Resizable Split & Diff',
    summary:
      'Advanced editing studio covering inline Proofread Markup inside Draft Mode, draggable-resizable Split Reference cross-checking, word-level Revision Diffs, and inline illustrations.',
    audience: 'Writers moving from first draft to surgical structural & line revision',
    lessons: [
      {
        id: 'm16-inline-proofread',
        title: '2.1 Inline Proofread Markup & 15 Standard Copyediting Marks',
        durationMin: 6,
        instruction:
          'Toggle Proofread directly inside Draft Mode (no separate page clutter), apply copyediting marks via right-click or palette buttons, test Clean Preview, and manage the collapsible Marks drawer.',
        objective: 'Conduct disciplined line edits with full accept/stet/reject auditability.',
        concepts: [
          'In Editorial and Full Studio layouts, clicking "Proofread" right on the Draft sheet header transforms your page cleanly into an interactive proof surface backed by a collapsible, resizable Marks ledger pane on the right. Because Proofread lives inside Draft Mode, you switch back to live drafting with one click without juggling multiple heavy modes.',
          'Quillvibe implements 15 authentic publishing copyediting marks: Delete, Insert Caret, Substitute, Author Query (AQ), Highlight, Transpose, Stet (leave untouched), New Paragraph, Run-In, Close Up, Insert Space, Capitalize, Lowercase, Italicize, and Bold.',
          'When proofread marks exist in a scene, Clean Preview lets you read how the paragraph flows if every open suggestion were accepted, without mutating your underlying source draft until you explicitly click Accept or Accept All (which automatically saves a safety Snapshot first).',
        ],
        steps: [
          'Click "Proofread" inside the Draft sheet header strip (top right of the paper sheet).',
          'Highlight any word or sentence on the sheet and right-click—or use "Quick Mark by Phrase" in the collapsible Marks pane—to attach a Delete, Substitute, or Query mark.',
          'Drag the vertical <-> divider between your manuscript and the Marks drawer to widen or narrow your review column.',
          'Toggle "Clean Preview" to read the tightened flow before clicking Accept or Stet.',
        ],
        example: {
          heading: 'Tightening Passive Clutter',
          body: 'Highlight "had been quietly trying to decide whether to signal", right-click -> Substitute -> "weighed signaling", preview Clean Preview, then Accept.',
        },
        proTip:
          'Need to cross-check Story Bible notes mid-proofread? Switch directly between Reference, Diff, and Marks using the tabs at the top of the collapsible right companion drawer—or click × to collapse back to full Draft width.',
        checkpoint: {
          question: 'What happens automatically right before "Accept All Marks" applies copyedits to your manuscript?',
          options: [
            'Quillvibe captures a safety Revision Snapshot so original prose stays recoverable',
            'All Story Bible entries are cleared',
            'The scene becomes permanently locked',
          ],
          correctIndex: 0,
          explanation:
            'Automatic backup snapshots ensure bulk copyediting changes can always be inspected or restored via Revision Diff.',
        },
        actionLabel: 'Open Inline Proofread in Draft',
        minTier: 'intermediate',
        targetView: 'editor',
        targetEditorSubMode: 'proofread',
        targetSelector: '.bv-pr-toolbar',
      },
      {
        id: 'm16-split-diff',
        title: '2.2 Resizable Split Reference Pane & Word-Level Revision Diff',
        durationMin: 6,
        instruction:
          'Open Split Ref inside Draft Mode to read any Scene or Story Bible card side-by-side, switch to Diff to compare drafts against snapshots, and drag the vertical divider to resize.',
        objective: 'Maintain continuity across chapters and verify revision cuts word-for-word without leaving Draft Mode.',
        concepts: [
          'Continuity errors happen when authors switch tabs back and forth while trying to recall what a character wore in Chapter Two or the exact wording of an earlier scene. Opening "Split Ref" docks a collapsible companion reader beside your live Draft sheet where you can select any Scene, Character, Location, or Lore card.',
          'Switching the companion drawer to "Diff" compares your active prose word-by-word against any captured Revision Snapshot, coloring additions in emerald and deletions in crimson strike-through with "+N added / -N removed" net word statistics and one-click Snapshot Restore.',
          'Just like the Binder and Inspector, the Split Reference / Diff companion pane includes a draggable vertical <-> handle (saved between sessions, 260px–640px) and an instant × Collapse button so your canvas remains serene.',
        ],
        steps: [
          'Click "Split Ref" inside the Draft sheet header strip to dock the companion pane beside your manuscript.',
          'Use the Reference dropdown to display an earlier scene (e.g. Chapter 1) or a Character card while typing new prose on the left.',
          'Drag the 5px vertical <-> divider between left paper and right pane to set your preferred column ratio; double-click the handle to reset to 360px.',
          'Click the "Diff" tab inside the companion header (or "Diff" on the Draft header) to audit changes against any Snapshot, then click × to collapse cleanly.',
        ],
        example: {
          heading: 'Cross-Checking Clue Continuity',
          body: 'Open Chapter I on the Split Reference pane while drafting Chapter IX so tide timings, brass instrument names, and signal codes align verbatim.',
        },
        proTip:
          'Press Ctrl+S anytime while drafting inside the Manuscript workspace to capture a named Revision Snapshot in half a second before starting bold rewrites.',
        checkpoint: {
          question: 'How do you resize or close the Split Reference / Diff companion drawer in Draft Mode?',
          options: [
            'Drag the vertical <-> divider handle to resize (double-click resets), and click × or toggle the button to collapse',
            'Export to PDF and reopen the browser',
            'Edit CSS files manually',
          ],
          correctIndex: 0,
          explanation:
            'The Draft companion drawer mirrors Quillvibe’s sidebars with persistent <-> drag-resizing and one-click × collapse.',
        },
        actionLabel: 'Open Resizable Split Reference',
        minTier: 'intermediate',
        targetView: 'editor',
        targetEditorSubMode: 'split',
        targetSelector: '.bv-split-pane',
      },
      {
        id: 'm16-inline-images',
        title: '2.3 Inline Scene Illustrations: Wrap Flow, Snap Guides & Bg Removal',
        durationMin: 4,
        instruction:
          'Insert or drag photos, maps, or sketches onto the Manuscript sheet, configure text wrap modes, align with snap-to-grid guides, and remove plain backgrounds locally.',
        objective: 'Lay out illustrated fiction, travel memoirs, or illuminated handbooks directly inside your scene.',
        concepts: [
          'For illustrated fiction, historical plates, or decorative chapter maps, placing images inside external layout tools forces constant re-imports whenever prose changes. Quillvibe lets you drop PNG, JPEG, or WebP artwork directly onto the Manuscript page and store responsive wrap geometry inside your .qv scene.',
          'Five text-wrapping modes (Wrap Left, Wrap Right, Top & Bottom, Inline, Behind Text) preview live around your prose paragraphs, complete with corner resize handles, magnetic alignment guides, and client-side background tolerance removal with instant Restore Original.',
        ],
        steps: [
          'Drag an image file onto the Manuscript paper sheet or click Insert Image in the formatting toolbar.',
          'Select a wrap mode (for example Wrap Right or Top & Bottom) and drag corner handles with Snap-to-Grid enabled.',
          'Optional: click Remove Background on line-art sketches over white paper and adjust Tolerance until edges read crisp.',
        ],
        example: {
          heading: 'Archipelago Chart Marginalia',
          body: 'Drop a nautical chart sketch at 38% width with Wrap Right beside the harbor sounding opening paragraphs.',
        },
        proTip:
          'Keep browser-mode scene images crisp and compressed under 1–2 MB so local IndexedDB/storage stays fast on every device.',
        checkpoint: {
          question: 'Where does Quillvibe run the image Background Remover calculation?',
          options: [
            'Locally offline on your own device with reversible Restore Original',
            'On an external cloud AI server requiring login',
            'Only after publishing an ISBN',
          ],
          correctIndex: 0,
          explanation:
            'Background tolerance stripping runs locally in-canvas on your device and keeps original bytes recoverable.',
        },
        actionLabel: 'Open Draft Toolbar',
        minTier: 'basic',
        targetView: 'editor',
        targetEditorSubMode: 'draft',
        targetSelector: '.bv-subbar',
      },
    ],
  },
  {
    id: 'mod-sg-deep-1',
    number: 17,
    track: 'story-graph',
    title: 'Story Graph 101: Spatial Storyboard, Nodes, Live Wires & Groups',
    summary:
      'Complete practical manual for Story Graph’s Spatial Storyboard: node anatomy, real-time obstacle-avoiding connectors, inline edge labeling, and optional Act Group frames.',
    audience: 'Writers visually mapping plot beats, character ties, and act arcs',
    lessons: [
      {
        id: 'm17-storyboard-canvas',
        title: '1.1 Storyboard Navigation, Node Creation & Board Surface Themes',
        durationMin: 6,
        instruction:
          'Pan, zoom (10%–500%), switch curated board surfaces, double-click anywhere to spawn Plot, Character, Faction, Item, or Scene cards, and click empty space to deselect.',
        objective: 'Navigate the infinite Story Graph board smoothly and build clean modular idea maps.',
        concepts: [
          'Story Graph operates in Full Studio layout in two complementary views: Spatial Storyboard (structured card layout with Act groups and crisp orthogonal connectors) and Force Graph (60 FPS physics constellation). Navigation behaves like modern vector studios: drag empty canvas to pan, scroll wheel or pinch trackpad to zoom around cursor, or use Ctrl+0 / Shift+1 to fit all cards.',
          'Notice card color accents by entity type across ten semantic categories: Character, Plot, Scene, Storyline, Faction, Location, Item, Lore, Note, and Custom. Clicking any card opens its Markdown notes and [[Wikilink]] controls in the right Properties sidebar; clicking empty board background—or pressing Escape—clears selection immediately.',
          'Double-clicking any synced Character, Location, Lore, or Scene card jumps straight into its Manuscript scene or Story Bible entry without hunting through menus.',
        ],
        steps: [
          'Open Story Graph from the top studio bar (ensure Full Studio layout is enabled).',
          'Pick a surface theme from the Board Surface dropdown (Obsidian Dots, Slate Blueprint, Warm Paper, Charcoal Solid, or Ivory Grid).',
          'Double-click empty board space to spawn a new Node, or press Shift+Drag to marquee-select a cluster of cards.',
          'Click any empty canvas background area (or press Esc) to cleanly deselect all cards, groups, and lines.',
        ],
        example: {
          heading: 'Daylight Paper Board Setup',
          body: 'Authors drafting in Ivory Light often set Story Graph Board Surface to Warm Paper or Ivory Grid so eyes never snap between dark canvas and white prose pages.',
        },
        proTip:
          'Press Shift+2 anytime to zoom the camera tightly onto just your currently selected card(s) without losing context on giant trilogy boards.',
        checkpoint: {
          question: 'How do you quickly deselect any active node, connector line, or group frame in Story Graph?',
          options: [
            'Click any empty background area of the canvas or press Esc',
            'Delete the node first',
            'Reload the entire application',
          ],
          correctIndex: 0,
          explanation:
            'Clicking open board background or pressing Escape clears active node, edge, and group selections cleanly.',
        },
        actionLabel: 'Open Story Graph Board',
        minTier: 'advanced',
        targetView: 'graph',
        targetSelector: '.bv-graph-canvas-wrap',
      },
      {
        id: 'm17-live-wires',
        title: '1.2 Real-Time Connector Wiring, Obstacle Routing & Inline Labels',
        durationMin: 6,
        instruction:
          'Drag port dots from any edge of a card to another card (or empty canvas), test 90-degree Elbow vs. Curved routing, and drag cards while watching every line reroute live.',
        objective: 'Create unambiguous, readable relationship diagrams where connectors never lose alignment during layout moves.',
        concepts: [
          'Every card exposes four directional port handles (Top, Right, Bottom, Left). Pulling a wire from one port onto another card attaches a typed connector ("connects to", "betrays", "investigates", "turns into"); pulling a wire onto empty board space spawns a linked Note card right at your cursor.',
          'Quillvibe’s orthogonal Elbow router detects intermediate cards as obstacles and routes 90-degree paths cleanly around them. Whenever you drag any card or group frame, EVERY connector across the board recalculates live on every pointer frame—both direct wires and neighboring obstacle-avoiding lines—so geometry stays exact while moving.',
          'Double-click any connector label pill directly on the board to rename its relationship inline, or select a line to drag its midpoint elbow offset or change Solid / Dashed / Dotted pattern and arrowhead geometry.',
        ],
        steps: [
          'Hover over any node card and drag from its glowing port dot onto a second card to link them.',
          'Double-click the new label pill midway along the line (e.g. type "owes passage" or "suspects").',
          'Drag either card across the board and observe how both attached connectors and surrounding elbow routes adjust in real time.',
          'Click any connector line directly to adjust Routing (90° Elbow / Smooth Curve / Straight), Arrowhead (Arrow / Diamond / Circle), or Pattern.',
        ],
        example: {
          heading: 'Mystery Evidence Topology',
          body: 'Use Solid Arrows for causal timeline sequence ("leads to"), Dashed Gold Diamonds for secret allegiances ("blackmails"), and Dotted circles for unverified rumors.',
        },
        proTip:
          'Hold Snap-to-Grid (On by default, 24px grid) while arranging cards horizontally—aligned card centers keep 90-degree elbow wires crisp and clean.',
        checkpoint: {
          question: 'What happens if you pull a port wire from a card and release it over empty canvas space?',
          options: [
            'Quillvibe automatically creates a new connected card right at your cursor',
            'The card is deleted',
            'Nothing can happen unless Auto-Sync is turned off',
          ],
          correctIndex: 0,
          explanation:
            'Dropping a dragged port wire onto open canvas spawns and connects a fresh idea card immediately for fast brainstorming.',
        },
        actionLabel: 'Inspect Graph Controls',
        minTier: 'advanced',
        targetView: 'graph',
        targetSelector: '.bv-graph-canvas-wrap',
      },
      {
        id: 'm17-group-frames',
        title: '1.3 Act & Section Group Frames ("Act 1" Frames): Purpose, Moving & Removal',
        durationMin: 5,
        instruction:
          'Understand what Group Frames (like Act 1) do, drag a group header to move all enclosed cards together, rename/color them, or remove frame boundaries cleanly without losing cards.',
        objective: 'Use Group Frames intentionally for multi-card movement—or remove them cleanly whenever you want freeform boards.',
        concepts: [
          'Users often wonder what an "Act 1" frame box in Story Graph is for: it is an optional Group Frame created via the "+ Group" button (default-named Act 1, Act 2, Act 3) designed to visually partition scenes or plotlines by act/thread and let you drag an entire cluster of enclosed cards simultaneously.',
          'Crucially, Group Frames do NOT lock or own your nodes. Moving the header moves cards resting inside its perimeter, collapsing ("Hide") tidies visual clutter, and clicking the direct × button on any group header—or clicking Remove Group Frame in Properties—deletes ONLY the boundary frame while leaving every node and connection completely intact.',
          'Right-click any group header (or select the group to inspect it in the right panel) to rename "Act 1" to any thematic container ("Opening Harbor Investigation", "B-Plot Romance") or adjust frame color.',
        ],
        steps: [
          'Click "+ Group" in the Story Graph subbar only when you want a visual Act or Subplot container around cards.',
          'Drag the Group header bar to translate the frame and every enclosed card together; pull its bottom-right corner handle to resize its area.',
          'Click any group header once to rename Title or adjust Frame Color inside the right Group Frame properties panel.',
          'Click the direct × button on the group header (or "Remove Group Frame (Keep Cards)") anytime to remove the frame cleanly without touching any nodes.',
        ],
        example: {
          heading: 'Three-Column Act vs. Dual Subplot Layout',
          body: 'Rename "Act 1" -> "Opening Crisis", add a second group "Midpoint Reversal", or remove frames completely when using Force Graph or Radial layout.',
        },
        proTip:
          'Turn on Auto-Layout (Columns, Radial Hubs, or Timeline Flow) from the Graph toolbar whenever cards pile up—you can undo any auto-layout immediately with Ctrl+Z.',
        checkpoint: {
          question: 'When you remove an "Act 1" Group Frame in Story Graph, what happens to the cards inside it?',
          options: [
            'All cards and connector lines stay safely on the canvas; only the decorative group border disappears',
            'Enclosed scenes are deleted from your manuscript',
            'Characters lose their Story Bible notes',
          ],
          correctIndex: 0,
          explanation:
            'Group Frames are non-destructive visual organizers; deleting a group removes only the outer box while preserving every card and edge.',
        },
        actionLabel: 'Inspect + Group Button',
        minTier: 'advanced',
        targetView: 'graph',
        targetSelector: '.bv-subbar',
      },
    ],
  },
  {
    id: 'mod-sg-deep-2',
    number: 18,
    track: 'story-graph',
    title: 'Story Graph 201: Force Physics, Path Analysis & Book Auto-Sync',
    summary:
      'Advanced computational narrative graphing: 60 FPS Force Graph simulation, Hop Depth neighborhood isolation, Shortest Narrative Path tracing, Color Rules, and .canvas interoperability.',
    audience: 'Authors auditing complex subplots, ensemble casts, and clue chains',
    lessons: [
      {
        id: 'm18-force-hops',
        title: '2.1 Force Graph Constellation Physics & Hop Neighborhood Isolation',
        durationMin: 5,
        instruction:
          'Switch from Storyboard to Force Graph mode, drag nodes to pin anchors, tune spring tension/repulsion physics, and isolate 1-hop or 2-hop character neighborhoods.',
        objective: 'Discover central story hubs and isolated side characters inside dense ensembles.',
        concepts: [
          'While Storyboard favors crisp geometric organization, complex 30-to-100 node story worlds benefit from physical equilibrium. Switching Story Graph to Force mode runs a smooth 60 FPS spring-and-repulsion physics engine that pulls heavily connected entities toward visual center hubs and pushes unrelated branches outward cleanly.',
          'You can pin critical anchor characters (like your Protagonist or Antagonist) while leaving minor actors free to cluster naturally around the scenes they inhabit.',
          'Turning on Hop Isolation (All / 1-Hop / 2-Hop / 3-Hop) hides everything outside the selected character’s immediate social and plot radius—ideal when checking whether one POV character touches enough plotlines in Act Two.',
        ],
        steps: [
          'Click "Force Graph" in the Story Graph top toggle bar.',
          'Drag central hubs into position (pinning them automatically) and observe edges settling into balanced constellations.',
          'Use the Force Controls HUD to toggle Node Focus -> "1-Hop" or "2-Hop" while clicking different leads to audit connectivity.',
        ],
        example: {
          heading: 'Catching an Under-Integrated Villain',
          body: 'Select your Antagonist and enable "1-Hop": if only 2 minor scenes touch them by midpoint, weave a stronger causal link to two Protagonist allies.',
        },
        proTip:
          'Pinning high-degree hub nodes prevents the simulation from drifting as you add later chapters—press the Pin switch in Node Properties anytime.',
        checkpoint: {
          question: 'What does Hop Depth Isolation (e.g., 1-Hop) show when a node is selected?',
          options: [
            'Only the selected node and entities within N direct links away, hiding unrelated clutter',
            'Only deleted chapters',
            'Only nodes without any connections',
          ],
          correctIndex: 0,
          explanation:
            'Hop filtering isolates local structural neighborhoods so complex cast webs can be audited one character at a time.',
        },
        actionLabel: 'Switch to Story Graph Force Mode',
        minTier: 'advanced',
        targetView: 'graph',
        targetSelector: '.bv-graph-canvas-wrap',
      },
      {
        id: 'm18-path-rules',
        title: '2.2 Shortest Narrative Path Tracing & Dynamic Color Rules',
        durationMin: 4,
        instruction:
          'Select a Start node and Target node in Path Tracing to illuminate the causal chain between them, and write dynamic Color Rules (e.g. kind:faction or #betrayal).',
        objective: 'Verify multi-step plot setups reach their payoff cleanly and color-code large story worlds automatically.',
        concepts: [
          'Every mystery clue, romantic tension, or political conspiracy spans multiple intermediate scenes before resolving. Quillvibe’s Shortest Narrative Path finder computes exact breadth-first graph traversal between any Start entity and Target payoff—highlighting every intervening node and edge in warm gold.',
          'Dynamic Color Rules let rules follow tags and categories automatically across dozens of cards without repainting nodes individually. Writing "#clue" or "kind:location" highlights every matching card consistently across exports and themes.',
        ],
        steps: [
          'Select any Source -> Target pair in the Path Finder controls to trace how an early item or character connects to the climax.',
          'Inspect empty Board Properties on the right sidebar (click blank canvas first) and add a Color Rule such as "kind:scene" or "#betrayal".',
          'Use the live Search filter in the toolbar to dim non-matching nodes when scanning massive world maps.',
        ],
        example: {
          heading: 'Gold Causal Clue Trail',
          body: 'Trace "Brass Astrolabe" -> "Harbor Master Ledger" -> "Skerry Signal Fire": verify zero dead ends exist between discovery and resolution.',
        },
        proTip:
          'Combine "#theme" tags inside Node Markdown Notes with Color Rules to visually map thematic motifs across acts.',
        checkpoint: {
          question: 'What does Path Tracing illuminate inside Story Graph?',
          options: [
            'The shortest causal chain of nodes and edges connecting a Start node to a Target node',
            'The total file size of exported PDFs',
            'Keyboard shortcut conflicts',
          ],
          correctIndex: 0,
          explanation:
            'Path Tracing highlights shortest step-by-step causality links across complex plot webs.',
        },
        actionLabel: 'Inspect Path & Color Rules',
        minTier: 'advanced',
        targetView: 'graph',
        targetSelector: '.bv-graph-sidebar',
      },
      {
        id: 'm18-autosync-canvas',
        title: '2.3 Two-Way Book Auto-Sync ([[Wikilinks]]) & .canvas JSON / SVG Export',
        durationMin: 5,
        instruction:
          'Keep Auto-Sync Book enabled for direct alignment with Manuscript scenes and Story Bible cards, trigger Sync [[Wikilinks]] from Markdown notes, and export Vector SVG, PNG, or .canvas files.',
        objective: 'Ensure zero drift between story diagrams, live chapters, and standalone visual exports.',
        concepts: [
          'Conventional mind-mapping software drifts out of date the moment chapter three changes a character name or splits a scene. With "Auto-Sync Book" active, renaming a character in Story Bible or adding chapters in the Binder automatically maintains synced graph cards—and editing a synced card’s label or notes writes cleanly back to your Story Bible or Scene synopsis.',
          'Adding [[Entity Name]] inside any node’s Markdown Notes wires live cross-links to matching cards when clicking "Sync [[Wikilinks]] Now". When sharing outlines with co-authors or external tools, Story Graph exports open `.canvas` JSON diagrams, Vector SVG, or crisp 2x PNG images.',
        ],
        steps: [
          'Verify "Auto-Sync Book" is toggled active in the Story Graph toolbar.',
          'Click any card and write "[[Clara Holm]]" inside Markdown Notes, then click "Sync [[Wikilinks]] Now" to create a link automatically.',
          'Export your finished diagram via SVG, PNG, or .canvas JSON cleanly from the toolbar.',
        ],
        example: {
          heading: 'Bi-Directional Bible Update',
          body: 'Update Clara Holm’s role subtitle directly in the Story Graph inspector -> open Story Bible and see Clara’s card updated identically.',
        },
        proTip:
          'Standard `.canvas` JSON export lets you back up or exchange spatial boards with JSON-Canvas compatible diagramming tools without vendor lock-in.',
        checkpoint: {
          question: 'What happens when you reference [[Another Card]] in Markdown Notes and click "Sync [[Wikilinks]] Now"?',
          options: [
            'Quillvibe automatically creates matching connector edges to those referenced cards',
            'It locks the chapter against future typing',
            'It clears all existing labels',
          ],
          correctIndex: 0,
          explanation:
            'Wikilink parsing discovers matching cards in your graph and generates missing edges cleanly.',
        },
        actionLabel: 'Inspect Auto-Sync Toolbar',
        minTier: 'advanced',
        targetView: 'graph',
        targetSelector: '.bv-subbar',
      },
    ],
  },
  {
    id: 'mod-cs-deep-1',
    number: 19,
    track: 'cover-studio',
    title: 'Book Cover Studio 101: Wrap Anatomy, Canvas & Layer Hierarchy',
    summary:
      'Foundational university seminar covering trade print cover anatomy (Front, Spine, Back, Dust-Jacket Flaps), precision zoom/panning, smart snapping, and non-destructive layer grouping.',
    audience: 'Authors designing print-ready paperback, hardcover, and eBook covers',
    lessons: [
      {
        id: 'm19-wrap-anatomy',
        title: '1.1 Five-Face Full Print Anatomy: Front, Spine, Back & Jacket Flaps',
        durationMin: 6,
        instruction:
          'Inspect Front, Spine, Back, Front Flap, and Back Flap templates in Book Cover Studio, set exact trim dimensions, and position spine typography safely inside bleed margins.',
        objective: 'Compose structurally accurate book jackets that survive commercial printing trim tolerances.',
        concepts: [
          'A complete printed book jacket spans five interconnected panels: Front Cover (sales centerpiece), Spine (narrow vertical hinge sized proportionally from book page count and trim), Back Cover (blurb, endorsement, barcode box), and optional Dust-Jacket Flaps (author bio & synopsis).',
          'Treating these five faces cleanly inside one project keeps palette harmony, rule alignments, and matching fonts unbroken across spine crease lines. Switching between individual Front Face eBook view and Full Print Wrap preview in Book Cover Studio lets you verify alignment before exporting.',
          'Templates (Obsidian Foil, Ivory Classic, Editorial Band, Full Bleed, Minimal Spine) provide balanced safe-margin scaffolding you can customize completely layer by layer.',
        ],
        steps: [
          'Open Studio -> Book Cover Studio (Full Studio layout).',
          'Toggle between Front Cover and Full Print Wrap views to inspect spine crease guides and back-cover margin boundaries.',
          'Select each Cover Face (Front, Spine, Back, Flaps) when placing title, spine author credit, and back blurb text layers.',
        ],
        example: {
          heading: 'Centered 6×9 Spine Tolerance',
          body: 'Keep spine text centered within the middle 65% of spine width so 1.5mm commercial press trimming shifts never clip descending letterforms.',
        },
        proTip:
          'Upload custom .ttf or .otf display serif fonts inside Settings -> Typefaces & Fonts first so both cover display typography and interior headings belong to the same foundry family.',
        checkpoint: {
          question: 'Which five faces can be designed together inside one Quillvibe Book Cover Studio project?',
          options: [
            'Front, Back, Spine, Front Flap, and Back Flap',
            'Only square thumbnails',
            'Manuscript chapters only',
          ],
          correctIndex: 0,
          explanation:
            'Book Cover Studio supports full dust-jacket wraps spanning Front, Spine, Back, and both interior flaps.',
        },
        actionLabel: 'Open Book Cover Studio',
        minTier: 'advanced',
        targetView: 'typeset',
        targetTypesetTab: 'cover',
        targetSelector: '.qv-studio-stage',
      },
      {
        id: 'm19-precision-canvas',
        title: '1.2 10%–500% Zoom, Space+Drag Panning & Magnetic Smart Guides',
        durationMin: 5,
        instruction:
          'Master vector-studio canvas navigation: Space+Drag to pan, Ctrl+= / - / 0 or trackpad pinch to zoom up to 500%, double-click canvas text to edit live, and align objects via magnetic smart guides.',
        objective: 'Achieve razor-sharp graphic alignment and rapid typography adjustments directly on the cover artboard.',
        concepts: [
          'Fine cover design requires moving fluidly between 30% thumbnail checks and 400% hairline kerning details. Book Cover Studio supports continuous 10%–500% zooming via trackpad pinch or Ctrl+= / - / 0 and instant Space+Drag panning without accidentally nudging locked layers.',
          'Eight-point scaling handles paired with rotation handles let you proportion crests, bands, and rules visually, while magnetic smart guides illuminate centerlines and mutual edge alignments across adjacent shapes and typography boxes.',
          'Double-clicking any text element edits copy, subtitle, or spine lines directly in-place on the canvas rather than hunting across forms.',
        ],
        steps: [
          'Hold Space and drag across the Cover Studio artboard to pan freely at 150%–300% zoom.',
          'Toggle Snap-to-Grid and Smart Alignment Guides in the top Cover toolbar, then drag a shape until purple center/edge guides flash into alignment.',
          'Double-click the main book Title directly on the cover canvas to adjust wording inline, or drag top rotation/corner scale handles.',
        ],
        example: {
          heading: 'Optical Centering Over Pure Math',
          body: 'Zoom to 200%, align title left edges precisely with an editorial accent rule using Smart Guides, then zoom back to 35% to judge visual weight.',
        },
        proTip:
          'Hold Shift while dragging or scaling/rotating objects to maintain clean orthogonal proportions cleanly.',
        checkpoint: {
          question: 'What shortcut pans the Book Cover Studio artboard cleanly without moving unlocked layers?',
          options: [
            'Hold Space + Drag',
            'Double-click Delete',
            'Press F11 repeatedly',
          ],
          correctIndex: 0,
          explanation:
            'Space+Drag temporarily activates the hand pan tool across the entire Cover Studio viewport.',
        },
        actionLabel: 'Inspect Cover Artboard Controls',
        minTier: 'advanced',
        targetView: 'typeset',
        targetTypesetTab: 'cover',
        targetSelector: '.qv-studio-canvas-scroll',
      },
      {
        id: 'm19-layers-groups',
        title: '1.3 Marquee Multi-Select, Ctrl+G Grouping, Layer Stacking & 100-Step Undo',
        durationMin: 5,
        instruction:
          'Select multiple layers via Shift+Click or marquee box, group locks with Ctrl+G, manage visibility/locks/flipping in the Layers panel, and rely on 100-step undo/redo.',
        objective: 'Organize complex multi-shape covers cleanly so ornaments, frames, and typography never drift out of sync.',
        concepts: [
          'As covers accumulate background gradients, border rules, ornaments, author crests, and subheadings, editing each individual layer becomes error-prone. Dragging a selection marquee over empty margin—or holding Shift while clicking—selects multiple shapes and text layers together.',
          'Pressing Ctrl+G groups selected artwork into a cohesive unit you can position as one assembly; clicking Eye toggles visibility during contrast tests, Lock pins settled background layers, and Bring-to-Front / Send-to-Back manages exact painter z-order.',
          'Every geometric tweak, font switch, color shift, and path stroke logs to Book Cover Studio’s 100-step history stack so brave visual experiments carry zero risk.',
        ],
        steps: [
          'Shift+Click two graphic layers (for example a decorative border rule and an emblem) or marquee-drag across them.',
          'Press Ctrl+G to group them, reposition the unified group cleanly on the canvas, and verify stacking inside the right Layers tab.',
          'Lock the background shape layer so selecting foreground text never grabs the sky/paper backdrop by accident.',
        ],
        example: {
          heading: 'Locked Textured Backdrop Pattern',
          body: 'Lock your full-bleed color field & gradient vignette layer immediately after setup so rapid title typography drags remain frictionless.',
        },
        proTip:
          'Flip-H and Flip-V layer actions mirror asymmetric botanical ornaments symmetrically across spine or front corners in two clicks.',
        checkpoint: {
          question: 'Which keyboard shortcut groups multi-selected layers in Book Cover Studio?',
          options: ['Ctrl + G', 'Ctrl + K', 'Alt + Enter'],
          correctIndex: 0,
          explanation:
            'Ctrl+G bundles selected cover elements so layout adjustments and alignments move them together cleanly.',
        },
        actionLabel: 'Inspect Cover Layers Panel',
        minTier: 'advanced',
        targetView: 'typeset',
        targetTypesetTab: 'cover',
        targetSelector: '.qv-studio-right-body',
      },
    ],
  },
  {
    id: 'mod-cs-deep-2',
    number: 20,
    track: 'cover-studio',
    title: 'Book Cover Studio 201: Pro Vector Drawing, Blend Modes & Exports',
    summary:
      'Advanced Desktop Pro & Production cover finishing: Freehand Brush & Vector Pen path drawing, 7 optical blend modes, Draft Variants Side-by-Side Comparison, Review Pins, and .qvdesign / PNG 3x / Vector SVG / Print PDF outputs.',
    audience: 'Authors and cover illustrators producing commercial covers and review rounds',
    lessons: [
      {
        id: 'm20-vector-blends',
        title: '2.1 Desktop Pro: Vector Pen Paths, Freehand Brush & 7 Optical Blend Modes',
        durationMin: 6,
        instruction:
          'Switch to the Draw tab in the Desktop App Cover Studio, craft crisp polygons or smooth calligraphic ink paths, and apply Multiply, Screen, Overlay, or Soft Light blend modes.',
        objective: 'Create original geometric motifs, textures, and layered lighting depth right inside Quillvibe.',
        concepts: [
          'While both Web and Desktop Cover Studios support vector templates, shapes, ornaments, gradients, and multi-resolution exports, the compiled Desktop App unlocks full vector illustration directly on the artboard: Freehand Brush smooth ink drawing and precision multi-vertex Vector Pen polygons.',
          'Each vector path exposes Stroke Color, Stroke Width, Close Path Fill, Opacity sliders, and seven optical blend modes (Normal, Multiply, Screen, Overlay, Soft Light, Darken, Lighten) inside the Properties inspector. Using Multiply on dark texture washes or Soft Light on warm foil shapes integrates uploaded artwork cleanly without muddy cutouts.',
          'You can also paste direct https:// image URLs in Desktop Uploads (for CORS-enabled assets) to embed pixels offline into your cover package.',
        ],
        steps: [
          'In the Desktop App Cover Studio, select the Draw tool tab -> Freehand Brush or Vector Pen.',
          'Plot multi-point geometric frames with Vector Pen or sketch expressive organic wave curves with Freehand Brush; toggle Close Path to fill shapes cleanly.',
          'Adjust Blend Mode (e.g. Multiply or Overlay) and Opacity in Properties to blend shapes into underlying cover photography or paper textures.',
        ],
        example: {
          heading: 'Editorial Foil Glint Over Texture',
          body: 'Draw an angular diamond horizon in muted amber (#d9b478) over a charcoal canvas texture and switch Blend Mode to Soft Light at 68% opacity.',
        },
        proTip:
          'Remember that Freehand Brush strokes, Vector Pen paths, 7 blend modes, Draft Comparisons, and Review Pins save directly inside standalone `.qvdesign` files even if kept separate from manuscript text.',
        checkpoint: {
          question: 'Which blend mode naturally integrates highlights/warm tones gently over underlying dark cover textures?',
          options: ['Overlay / Soft Light (Desktop Pro Vector Studio)', 'Hard Page Wrap', 'Lock Layer'],
          correctIndex: 0,
          explanation:
            'Optical blend modes like Overlay, Soft Light, Multiply, and Screen composite depth natively across stacked vector and image layers.',
        },
        actionLabel: 'Inspect Pro Cover Tools',
        minTier: 'advanced',
        targetView: 'typeset',
        targetTypesetTab: 'cover',
        targetSelector: '.qv-studio-left-body',
      },
      {
        id: 'm20-drafts-pins',
        title: '2.2 Draft Variants Side-by-Side Comparison & Pin Collaboration (.qvdesign)',
        durationMin: 5,
        instruction:
          'Save contrasting cover concepts as Draft Variants, compare two designs side-by-side before promoting a winner, and drop numbered Review Pins for collaborators via .qvdesign.',
        objective: 'Run objective cover critique cycles without overwriting promising alternatives or leaking manuscript prose.',
        concepts: [
          'Strong cover design demands A/B discipline: testing a sparse typographic ivory jacket against a full-bleed atmospheric dusk design side by side rather than tweaking one canvas endlessly until contrast blurs. Draft Variants save named full snapshots you can inspect side-by-side in one split comparison view before clicking Promote Winner.',
          'When working with editors, co-authors, or cover illustrators, numbered Canvas Review Pins anchor exact critique notes ("nudge subtitle up 4mm", "lighten background behind author name") right at pixel coordinates on any face.',
          'Exporting a `.qvdesign` archive packages cover layers, custom vector paths, variants, and pins independently of unpublished chapters—so illustrators work with full vector fidelity and zero manuscript exposure.',
        ],
        steps: [
          'Save your current layout as Draft A inside Cover Drafts, experiment boldly with color/type, and save Draft B.',
          'Open Side-by-Side Comparison to evaluate hierarchy, breathing room, and title legibility between both drafts, then click Promote Winner.',
          'Add Review Pins on Front or Spine targets, then export `.qvdesign` for collaborator review or merge incoming pins via Merge Pins Only.',
        ],
        example: {
          heading: 'Safe Illustrator Handoff',
          body: 'Send Sea-Salt-Cover.qvdesign to your illustrator instead of your full `.qv` book file; when they send back refined vectors, import and Merge Pins cleanly.',
        },
        proTip:
          'Pair Side-by-Side Variant comparison with a quick check at 25% scale—if your runner-up beats your favorite at thumbnail distance, promote the clearer design.',
        checkpoint: {
          question: 'Why do authors exchange covers as `.qvdesign` packages instead of sharing the full `.qv` file?',
          options: [
            '`.qvdesign` shares full editable cover layers, variants, and review pins without exposing unpublished manuscript chapters',
            '`.qv` cannot store cover designs',
            '`.qvdesign` strips all fonts automatically',
          ],
          correctIndex: 0,
          explanation:
            'Splitting cover artwork into `.qvdesign` protects manuscript confidentiality while keeping full vector editability.',
        },
        actionLabel: 'Inspect Cover Studio Collaborations',
        minTier: 'advanced',
        targetView: 'typeset',
        targetTypesetTab: 'cover',
        targetSelector: '.qv-studio-stage',
      },
      {
        id: 'm20-multi-exports',
        title: '2.3 Print PDF, Vector SVG, Transparent PNG & 1x/2x/3x Release Exports',
        durationMin: 4,
        instruction:
          'Verify final color contrast, spine dimensions, and trim clearances, then export high-DPI 1x/2x/3x PNG, Transparent PNG motifs, Vector SVG, JPEG, or print-ready wrap PDF.',
        objective: 'Generate clean production deliverables for e-readers, storefront ads, print houses, and vector presses.',
        concepts: [
          'Different distribution channels demand distinct formats: online bookstores expect sharp 1600×2560+ RGB PNG or JPEG front covers; promotional badges use Transparent PNG exports; large-format signage or foil dies benefit from lossless Vector SVG curves; and print-on-demand binders expect trim-exact full-wrap PDF output.',
          'Selecting export scale (1x draft check, 2x storefront retina, 3x oversized display) renders clean high-resolution bitmaps straight from your live canvas geometry without raster blur.',
        ],
        steps: [
          'Perform a final zoom-out audit at 25% (thumbnail test) and 200% (edge/alignment check) across Front, Spine, and Back.',
          'Click Export inside Book Cover Studio to pick PNG (1x / 2x / 3x or Transparent), JPEG, Vector SVG, or Print Wrap PDF.',
          'Bundle your final cover exports beside your `.qv` source file and Interior Typeset EPUB 3 / Print PDF inside your Publish archival folder.',
        ],
        example: {
          heading: 'Complete Launch Asset Pack',
          body: 'Export: Front Cover PNG 3x (storefronts), Full Print Wrap PDF (paperback printer), SVG emblem mark (author website), and master `.qvdesign` + `.qv` backup.',
        },
        proTip:
          'Always verify exported PDFs and PNGs in an external viewer across bright and dark screen backgrounds before final upload.',
        checkpoint: {
          question: 'Which Cover Studio export option stays infinitely sharp at billboard or foil-stamp print sizes?',
          options: ['Vector SVG', 'Low-res 1x JPEG', 'Plain .txt'],
          correctIndex: 0,
          explanation:
            'Vector SVG preserves mathematical shapes, text geometry, and vector paths cleanly at any physical scale.',
        },
        actionLabel: 'Open Publish & Export Center',
        minTier: 'advanced',
        targetView: 'typeset',
        targetTypesetTab: 'publish',
        targetSelector: '.bv-typeset-layout',
      },
    ],
  },
  {
    id: 'mod-web-browser',
    number: 21,
    track: 'manuscript',
    platform: 'web',
    title: 'Website Edition: Browser Saving, Clean URLs & Offline Habits',
    summary:
      'Write in any modern browser without installation, download manual .qv backups reliably, use direct studio routes, and transfer drafts cleanly to Desktop.',
    audience: 'Authors writing inside quillvibe.jhonrey.com on browser or Chromebook',
    lessons: [
      {
        id: 'm21-web-save',
        title: 'Browser IndexedDB Auto-Cache vs Explicit .qv File Downloads',
        durationMin: 4,
        instruction:
          'Understand how the Website edition caches edits locally in IndexedDB while relying on Ctrl+S or Save to export portable .qv files to your computer.',
        objective: 'Protect browser-written manuscripts against cache clears or browser profile resets.',
        concepts: [
          'In the Website edition, every stroke is written quickly to your browser’s private IndexedDB storage so refreshing the page does not lose your chapter. Browser sandboxes cannot silently overwrite files on your hard drive without a save dialog.',
          'Clicking Save (or pressing Ctrl+S) downloads a self-contained .qv archive containing your manuscript prose, inline images, Story Bible cards, Story Graph layout, and cover layers. Keep the latest downloaded .qv file in your personal cloud folder or USB drive at the end of every session.',
        ],
        steps: [
          'Confirm "Saved" shows in the bottom status strip after typing in Manuscript.',
          'Click Save in the top bar (or press Ctrl+S) to download a portable .qv backup archive to your Downloads folder.',
          'Open Settings -> Workspace & Backup to verify your Web Save Interval and Open Local .qv option.',
        ],
        example: {
          heading: 'Safe Web Session Wrap-Up',
          body: 'Before clearing browser cookies or switching laptops: click Save, verify SaltCartographer.qv appears in Downloads, then drop it into your backup drive.',
        },
        proTip:
          'Desktop removes the manual download step completely by writing silently to your chosen folder on every change.',
        checkpoint: {
          question: 'Why should Website users still click Save at the end of a browser writing session?',
          options: [
            'To download an independent .qv archive onto disk that survives browser cache clearing',
            'Because Typed words vanish when switching between Draft and Corkboard',
            'To upload chapters onto a public community feed',
          ],
          correctIndex: 0,
          explanation:
            'Browser IndexedDB stays inside that specific browser profile; downloading a .qv archive protects your whole book on your filesystem.',
        },
        actionLabel: 'Inspect Top Save Bar',
        minTier: 'basic',
        targetView: 'editor',
        targetSelector: '.bv-topbar',
      },
      {
        id: 'm21-web-routes',
        title: 'Direct Web URLs (/start, /write, /course, /help) & Universal Search',
        durationMin: 3,
        instruction:
          'Bookmark direct browser URLs to land straight inside Drafting, Academy, or Help, and press Ctrl+K anytime to jump to any scene, guide, or studio tool.',
        objective: 'Navigate the full web workspace cleanly via direct links and universal command search.',
        concepts: [
          'Unlike single-URL tools that drop you onto a marketing page every morning, Quillvibe Web separates "/" (editorial overview), "/start" (Welcome & Shelf picker), "/write" (Manuscript sheet), "/graph" (Story Graph), "/studio/cover" (Cover Studio), "/course" (Academy), "/help" (Knowledge Base), and "/settings".',
          'Pressing Ctrl+K (or clicking the Search magnifying icon) queries open scenes, Story Bible entries, Help FAQ topics, Course lessons, and workspace commands in one filterable dialog.',
        ],
        steps: [
          'Press Ctrl+K or click the Search icon in the centered top bar.',
          'Type "proofread", "cover", or a character name to inspect instant cross-studio results.',
          'Bookmark /write in your browser bar for instant morning entry without landing-page detours.',
        ],
        example: {
          heading: 'Morning Bookmark Setup',
          body: 'Pin https://quillvibe.jhonrey.com/write for daily drafting and https://quillvibe.jhonrey.com/course for craft study.',
        },
        proTip:
          'Clicking a Universal Search course result jumps directly to that lesson inside Academy rather than resetting your progress.',
        checkpoint: {
          question: 'Which keyboard shortcut opens Quillvibe Universal Search from any studio or help page?',
          options: ['Ctrl+K', 'Alt+F4', 'Shift+Tab'],
          correctIndex: 0,
          explanation: 'Ctrl+K opens Universal Search across manuscripts, tools, FAQs, error codes, and Academy lessons.',
        },
        actionLabel: 'Open Universal Search Button',
        minTier: 'basic',
        targetView: 'editor',
        targetSelector: '#bv-universal-search-btn',
      },
      {
        id: 'm21-web-handoff',
        title: 'Handoff Workflow: Moving Books Between Website & Desktop App',
        durationMin: 4,
        instruction:
          'Start a book in any browser, save the .qv bundle, and open the identical file inside the Desktop app with zero formatting or graph loss.',
        objective: 'Keep manuscript prose, Story Graph positions, and covers 100% portable between Web and Desktop.',
        concepts: [
          'The Website and Desktop apps read the exact same .qv specification. A manuscript drafted on a tablet or public computer in the Website edition opens identically inside Windows, macOS, or Linux Desktop.',
          'Desktop-only Pro Cover Studio vector paths remain preserved inside the .qv project even when opened later on the Web for text edits, so alternating between travel browsers and a home workstation stays lossless.',
        ],
        steps: [
          'Export or Save your .qv archive from the Website session.',
          'On Desktop, press Ctrl+O or drag the .qv file directly onto any open window or New Tab.',
          'When returning to Desktop-exclusive features like Pro Vector Draw paths or LAN transfer, your earlier browser chapters appear immediately in the Binder.',
        ],
        example: {
          heading: 'Cross-Device Week',
          body: 'Draft Chapters 4-5 in a café browser -> Save .qv -> Double-click at home in Desktop Quillvibe for Pro Cover design and Print PDF export.',
        },
        proTip:
          'Use "Save Project Bundle (.qv)" in Settings or the top bar whenever moving between two machines.',
        checkpoint: {
          question: 'What happens if you open a Desktop project containing Pro Cover Studio vector strokes inside the Website editor?',
          options: [
            'Manuscript editing and Web views work normally while stored Desktop data remains intact inside the .qv file',
            'The Website deletes all cover layers automatically',
            'The file extension renames itself to .txt',
          ],
          correctIndex: 0,
          explanation:
            'Quillvibe keeps non-active edition data untouched inside the unified .qv archive.',
        },
        actionLabel: 'Open Settings & Backup',
        minTier: 'basic',
        targetView: 'settings',
        targetSelector: '.bv-main-stage',
      },
    ],
  },
  {
    id: 'mod-desktop-tabs',
    number: 22,
    track: 'manuscript',
    platform: 'desktop',
    title: 'Desktop Window Craft: Stacked Book Tabs, Tear-Off & OS Opening',
    summary:
      'Operate multiple manuscripts simultaneously with stacked Chrome-style book tabs, drag-to-detach windows, and double-click OS file opening.',
    audience: 'Desktop App authors managing series books, side notes, or reference manuscripts',
    lessons: [
      {
        id: 'm22-tab-strip',
        title: 'Stacked Chrome-Style Book Tab Bar & New Tab Picker (Ctrl+Shift+N)',
        durationMin: 4,
        instruction:
          'Open multiple .qv books or companion windows inside a single stacked tab strip, reorder tabs by dragging horizontally, or summon a fresh New Tab picker.',
        objective: 'Keep trilogy volumes, world Bibles, and working drafts side by side inside one clean Desktop frame.',
        concepts: [
          'Only the installed Desktop App renders the top stacked Book Tab Bar above the main studio bar. Every tab hosts an independent book workspace with its own active scene, layout tier, and undo history.',
          'Click "+" or press Ctrl+Shift+N to open an empty New Tab chooser where you can create a new book, pick from recently opened manuscripts, or browse OS files without disturbing open chapters.',
        ],
        steps: [
          'Click the "+" button on the right edge of the Desktop Tab Bar (or press Ctrl+Shift+N).',
          'Open a second manuscript or Reference Book from the picker list.',
          'Drag tab pills left or right along the strip to set your reading order.',
        ],
        example: {
          heading: 'Trilogy Continuity Desk',
          body: 'Tab 1: Volume II Working Draft | Tab 2: Series Bible Reference | Tab 3: Short Story Collection — switching in one click.',
        },
        proTip:
          'If a tab window stays open while you switch scenes, live conflict-safe local sync propagates changes if the same file is inspected.',
        checkpoint: {
          question: 'What does pressing Ctrl+Shift+N or clicking "+" on the Desktop Book Tab Bar open?',
          options: [
            'An empty New Tab book picker for recent manuscripts, blank books, or OS files',
            'A public web search engine',
            'A permanent delete dialog for open tabs',
          ],
          correctIndex: 0,
          explanation:
            'The Desktop New Tab lets you open another manuscript cleanly without closing your active chapter.',
        },
        actionLabel: 'Inspect Desktop Tab Bar',
        minTier: 'basic',
        targetView: 'editor',
        targetSelector: '.bv-desktop-tabbar',
      },
      {
        id: 'm22-tearoff-merge',
        title: 'Vertical Tear-Off Windows & Z-Ordered Window Merging',
        durationMin: 4,
        instruction:
          'Pull any book tab vertically downward off the tab strip to spawn a second monitor window, or drag a sole tab back onto another window’s tab strip to merge them.',
        objective: 'Spread reference chapters cleanly across two monitors without copy-pasting or duplicate disk conflicts.',
        concepts: [
          'Desktop tabs use a central drag-and-drop window state machine: horizontal dragging reorders tabs along the bar, while pulling downward past the threshold detaches that tab into its own OS window preserving cursor grab position.',
          'Dragging a single-tab window back into another Quillvibe window’s top strip snaps and merges it back into that window cleanly.',
        ],
        steps: [
          'Hold left-click on a book tab title (with 2+ tabs open) and drag steadily downward out of the tab strip.',
          'Position the detached window beside your main monitor or split left/right on Windows Snap.',
          'Click the top-right New Window icon or drag a sole tab over another bar to merge back.',
        ],
        example: {
          heading: 'Two-Screen Revision Pass',
          body: 'Tear out Book 1 onto your left monitor in Story Graph view while revising Book 2 on your primary monitor.',
        },
        proTip:
          'Sole-tab windows move smoothly when you drag the tab header area so window positioning feels natural on both multi-display and laptop setups.',
        checkpoint: {
          question: 'How do you turn one tab from a Desktop window into an independent second OS window?',
          options: [
            'Pull the tab vertically downward past the tab strip threshold',
            'Double-click the status word count',
            'Turn off Smooth Animations in Settings',
          ],
          correctIndex: 0,
          explanation:
            'Vertical tear-off detaches the selected book tab into its own synced OS window at the cursor position.',
        },
        actionLabel: 'View Desktop Window Controls',
        minTier: 'intermediate',
        targetView: 'editor',
        targetSelector: '.bv-topbar',
      },
      {
        id: 'm22-file-assoc',
        title: 'Single-Instance File Associations (.qv, .qvbible, .qvdesign)',
        durationMin: 3,
        instruction:
          'Open .qv, .qvbible, .qvscene, .qvstyle, and .qvdesign files straight from Windows Explorer, macOS Finder, or Linux file managers into a new tab in your running studio.',
        objective: 'Launch manuscripts and standalone design packages by double-clicking them natively on your computer.',
        concepts: [
          'Instead of opening conflicting duplicate app instances, the Desktop build routes OS double-click open events to your existing running Quillvibe window and loads the opened file safely as a new tab.',
          'Quillvibe recognizes five native file extensions: .qv (complete book), .qvbible (world archive), .qvscene (single scene transfer), .qvstyle (custom font/trim stylesheet), and .qvdesign (cover artwork exchange).',
        ],
        steps: [
          'Double-click any saved .qv or .qvdesign file in your computer file manager while Quillvibe Desktop is open.',
          'Verify it opens as a fresh tab beside your active project rather than overwriting your unsaved screen.',
          'Open Extensions & Formats or Settings to review file binding preferences.',
        ],
        example: {
          heading: 'Collaborator Handoff',
          body: 'Double-clicking "Cover-Final-Alt.qvdesign" sent by a cover artist pops the editable artboard straight into a tab beside your manuscript.',
        },
        proTip:
          'Keep active book drafts organized in dated folders; single-instance opening ensures double-clicking an older backup loads it in a comparison tab cleanly.',
        checkpoint: {
          question: 'Which native extension opens editable cover artwork cleanly in Desktop without exposing manuscript chapters?',
          options: ['.qvdesign', '.rtf', '.txt'],
          correctIndex: 0,
          explanation: '.qvdesign carries Book Cover Studio layers, guides, and vector paths separately from private prose chapters.',
        },
        actionLabel: 'Inspect Settings & Formats',
        minTier: 'basic',
        targetView: 'settings',
        targetSelector: '.bv-main-stage',
      },
    ],
  },
  {
    id: 'mod-desktop-os',
    number: 23,
    track: 'craft-publishing',
    platform: 'desktop',
    title: 'Desktop Studio Exclusives: Fullscreen Bar, Auto-Save & Native Updater',
    summary:
      'Use F11 fullscreen sprint mode with live clock, automatic disk saving, local Wi-Fi/Bluetooth sharing, and built-in GitHub Release updates.',
    audience: 'Desktop App authors maximizing daily word throughput, privacy, and app updates',
    lessons: [
      {
        id: 'm23-f11-sprint',
        title: 'F11 Fullscreen Distraction-Free Mode & Floating Sprint Bar',
        durationMin: 3,
        instruction:
          'Press F11 (or click the Fullscreen icon) on Desktop to fill the entire display while retaining subtle clock, word goal, and sprint alarm status.',
        objective: 'Write without taskbar clutter or notification distractions on Windows, macOS, and Linux.',
        concepts: [
          'Unlike browser F11 which hides the operating system frame generically, Desktop Fullscreen tunes top-strip density and pairs naturally with the Sprint Timer (25m/45m countdown) and Wake-Up Alarm ringtones.',
          'Pair F11 with Focused Workspace Layout and Obsidian Dark (or Warm Parchment) to build a dedicated digital typewriter.',
        ],
        steps: [
          'Click the Expand Fullscreen icon in the top toolbar or press F11 on Desktop.',
          'Set a 25m Sprint Timer in the bottom footer and click Start.',
          'Write two uninterrupted paragraphs before pressing F11 or Esc to restore your normal window chrome.',
        ],
        example: {
          heading: 'Evening Word Sprint',
          body: 'Obsidian Dark + F11 Fullscreen + Focused tier + 25m Pomodoro Sprint -> zero menus, high-contrast ivory serif type.',
        },
        proTip:
          'You can arm a custom ringtone alarm inside the footer bar so you never need to look at your phone while drafting.',
        checkpoint: {
          question: 'Which key toggles native fullscreen focus inside the Desktop Studio?',
          options: ['F11', 'Ctrl+Q', 'Backspace'],
          correctIndex: 0,
          explanation: 'F11 (or the toolbar Expand button) toggles native Desktop Fullscreen cleanly.',
        },
        actionLabel: 'Open Fullscreen Control',
        minTier: 'basic',
        targetView: 'editor',
        targetSelector: '.bv-main-stage',
      },
      {
        id: 'm23-native-save-lan',
        title: 'Direct Native Disk Auto-Save & Local Wi-Fi / Bluetooth Sharing',
        durationMin: 4,
        instruction:
          'Write directly to disk folders without browser download prompts and beam signed .qv manuscripts across local Wi-Fi or Bluetooth without cloud servers.',
        objective: 'Maintain local-only privacy while moving drafts rapidly between co-authors or personal machines.',
        concepts: [
          'The Desktop Tauri/Rust backend reads and writes native files directly when you link a project folder, eliminating repeated Download folder copies while keeping atomic crash-safe backups.',
          'Inside Collaboration & Publish, Desktop provides local LAN Wi-Fi and peer transfer tools to exchange encrypted or co-author-signed .qv files directly inside the same room with zero third-party servers.',
        ],
        steps: [
          'Open a local .qv book file via File Open (Ctrl+O) in Desktop so changes bind directly to your disk path.',
          'Navigate to Typeset -> Publish & Share to view Local Wi-Fi / LAN & Bluetooth transfer readiness alongside .docx/.epub exports.',
          'Run Check Integrity before shipping any signed manuscript copy.',
        ],
        example: {
          heading: 'Offline Co-Author Cabin Session',
          body: 'Zero internet at a writing retreat -> Desktop writes natively to SSD and exchanges sealed .qv scenes directly over local Wi-Fi.',
        },
        proTip:
          'Every signed transfer logs your Origin Device ID (`QVD-*`) so two co-authors can reconcile drafts confidently without overwriting each other.',
        checkpoint: {
          question: 'How does Desktop auto-saving differ from Website IndexedDB saving?',
          options: [
            'Desktop writes directly to your real filesystem path without repetitive browser download popups',
            'Desktop disables saving unless connected to Wi-Fi',
            'Desktop saves files only as temporary clipboard text',
          ],
          correctIndex: 0,
          explanation: 'Desktop binds straight to your filesystem folder via the Rust core for direct local disk saves.',
        },
        actionLabel: 'Open Publish & Share Tools',
        minTier: 'advanced',
        targetView: 'typeset',
        targetTypesetTab: 'publish',
        targetSelector: '.bv-typeset-layout',
      },
      {
        id: 'm23-updater-security',
        title: 'Built-In GitHub Release Updater & Branded Desktop Installer',
        durationMin: 3,
        instruction:
          'Check for official Quillvibe Desktop updates directly inside Settings without hunting GitHub manually, and verify signed installer packages.',
        objective: 'Keep your installed Windows, macOS, or Linux studio current while preserving local books and fonts.',
        concepts: [
          'Inside Settings on Desktop, clicking Check for Updates queries official GitHub Releases metadata (`jhonrey-com/Quillvibe`) and launches a clean in-app update dialog displaying release notes and download progress.',
          'Installed fonts (.ttf/.otf/.woff2), Author Signing Keys, and library books reside safely inside your user app data directory outside the executable folder, so upgrading from v3.2.0 to newer releases leaves every book intact.',
        ],
        steps: [
          'Open Settings from the centered top bar.',
          'Locate the Desktop Application & Updates panel and click Check for Updates.',
          'Verify current build version matches the latest GitHub Release tag.',
        ],
        example: {
          heading: 'Zero-Risk Version Upgrade',
          body: 'Run Check for Updates -> inspect changelog -> update executable while your Story Bible, Cover Studio layers, and custom fonts remain untouched.',
        },
        proTip:
          'Export a full .qv backup before major major-number updates as good archival hygiene alongside automatic disk saves.',
        checkpoint: {
          question: 'Where do your books and custom fonts stay when the Desktop app updates to a newer version?',
          options: [
            'Safely untouched in your user data directory outside the application executable',
            'Deleted so you start blank after each release',
            'Uploaded publicly to GitHub Issues',
          ],
          correctIndex: 0,
          explanation: 'Book libraries, signing keys, and typefaces live in user data storage independent of the app binary.',
        },
        actionLabel: 'Open Desktop Settings',
        minTier: 'basic',
        targetView: 'settings',
        targetSelector: '.bv-main-stage',
      },
    ],
  },
];

export function readCompletedCourseLessons(): Set<string> {
  if (typeof window === 'undefined' || !window.localStorage) return new Set(memoryCompletedLessons);
  try {
    const raw = window.localStorage.getItem(COURSE_PROGRESS_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? new Set(parsed as string[]) : new Set();
  } catch {
    return new Set();
  }
}

export function writeCompletedCourseLessons(done: Set<string>): void {
  memoryCompletedLessons = new Set(done);
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.setItem(COURSE_PROGRESS_KEY, JSON.stringify(Array.from(done)));
  } catch {
    // Ignore storage limits
  }
}

export function toggleCourseLessonDone(lessonId: string, forceState?: boolean): Set<string> {
  const done = readCompletedCourseLessons();
  const nextVal = forceState !== undefined ? forceState : !done.has(lessonId);
  if (nextVal) done.add(lessonId);
  else done.delete(lessonId);
  writeCompletedCourseLessons(done);
  return done;
}

export function getCourseCompletionSummary(
  platformFilter: 'all' | 'web' | 'desktop' = 'all',
): { completed: number; total: number; pct: number } {
  const done = readCompletedCourseLessons();
  const matchingModules = COURSE_MODULES.filter((m) => {
    if (platformFilter === 'all') return true;
    const p = getModulePlatform(m);
    return p === 'both' || p === platformFilter;
  });
  const all = matchingModules.flatMap((m) => m.lessons);
  const completed = all.filter((l) => done.has(l.id)).length;
  const total = all.length;
  return { completed, total, pct: total > 0 ? Math.round((completed / total) * 100) : 0 };
}

let activeCourseDrawer: HTMLElement | null = null;
let activeModuleIndex = 0;
let drawerCollapsed = false;
let drawerPos: { left: number; top: number } | null = null;
let drawerResizeHandler: (() => void) | null = null;

interface ActiveGuideSession {
  lessonId: string;
  engaged: boolean;
  cursorEl: HTMLElement | null;
  rippleEl: HTMLElement | null;
  speechEl: HTMLElement | null;
  arrivalTimer: number | null;
  cursorFadeTimer: number | null;
  idleTimer: number | null;
  pulseTimer: number | null;
  targetEl: HTMLElement | null;
  onTargetInteract: (() => void) | null;
}

let activeGuide: ActiveGuideSession | null = null;
let onActiveLessonMarkedDone: ((lessonId: string, isDone: boolean) => void) | null = null;

function clampDrawerPosition(drawer: HTMLElement, left: number, top: number): { left: number; top: number } {
  if (typeof window === 'undefined') return { left, top };
  const pad = 12;
  const w = drawer.offsetWidth > 0 ? drawer.offsetWidth : Math.min(400, window.innerWidth - 28);
  const h = drawer.offsetHeight > 0 ? drawer.offsetHeight : drawerCollapsed ? 46 : Math.min(540, window.innerHeight - 56);
  const maxLeft = Math.max(pad, window.innerWidth - w - pad);
  const maxTop = Math.max(pad, window.innerHeight - h - pad);
  const clamped = {
    left: Math.round(Math.max(pad, Math.min(maxLeft, left))),
    top: Math.round(Math.max(pad, Math.min(maxTop, top))),
  };
  drawer.style.left = `${clamped.left}px`;
  drawer.style.top = `${clamped.top}px`;
  drawer.style.right = 'auto';
  drawer.style.bottom = 'auto';
  drawerPos = clamped;
  if (activeGuide?.speechEl?.isConnected) {
    positionSpeechDialogBesideDrawer(activeGuide.speechEl);
  }
  return clamped;
}

function rectsOverlap(
  a: { left: number; top: number; right: number; bottom: number },
  b: { left: number; top: number; right: number; bottom: number },
): boolean {
  return !(a.right <= b.left || a.left >= b.right || a.bottom <= b.top || a.top >= b.bottom);
}

function dodgeDrawerFromRect(targetRect: DOMRect): void {
  if (typeof window === 'undefined' || !activeCourseDrawer || !activeCourseDrawer.isConnected) return;
  const drawer = activeCourseDrawer;
  const dr = drawer.getBoundingClientRect();
  const margin = 20;
  const paddedTarget = {
    left: targetRect.left - margin,
    top: targetRect.top - margin,
    right: targetRect.right + margin,
    bottom: targetRect.bottom + margin,
  };

  if (!rectsOverlap(dr, paddedTarget)) return;

  const w = dr.width || Math.min(400, window.innerWidth - 28);
  const h = dr.height || 460;
  const pad = 16;
  const candidates = [
    { left: pad, top: Math.max(pad, window.innerHeight - h - 42) },
    { left: Math.max(pad, window.innerWidth - w - pad), top: Math.max(pad, window.innerHeight - h - 42) },
    { left: pad, top: 60 },
    { left: Math.max(pad, window.innerWidth - w - pad), top: 60 },
  ];

  let best = candidates[0];
  for (const cand of candidates) {
    const cRect = { left: cand.left, top: cand.top, right: cand.left + w, bottom: cand.top + h };
    if (!rectsOverlap(cRect, paddedTarget)) {
      best = cand;
      break;
    }
  }

  // Fallback to whichever corner sits farthest from target center if target spans across screen
  if (
    rectsOverlap({ left: best.left, top: best.top, right: best.left + w, bottom: best.top + h }, paddedTarget)
  ) {
    const tCx = (targetRect.left + targetRect.right) * 0.5;
    const tCy = (targetRect.top + targetRect.bottom) * 0.5;
    let bestDist = -1;
    for (const cand of candidates) {
      const dist = Math.hypot(cand.left + w * 0.5 - tCx, cand.top + h * 0.5 - tCy);
      if (dist > bestDist) {
        bestDist = dist;
        best = cand;
      }
    }
  }

  clampDrawerPosition(drawer, best.left, best.top);
}

function positionSpeechDialogBesideDrawer(speech: HTMLElement): void {
  if (typeof window === 'undefined') return;
  const sW = speech.offsetWidth > 0 ? speech.offsetWidth : Math.min(310, window.innerWidth - 32);
  const sH = speech.offsetHeight > 0 ? speech.offsetHeight : 148;
  const dr = activeCourseDrawer?.isConnected ? activeCourseDrawer.getBoundingClientRect() : null;

  if (!dr || window.innerWidth <= 900) {
    speech.classList.remove('is-tail-left');
    speech.style.left = `${Math.max(16, Math.round((window.innerWidth - sW) * 0.5))}px`;
    speech.style.top = '64px';
    speech.style.right = 'auto';
    speech.style.bottom = 'auto';
    return;
  }

  const spaceLeft = dr.left - 14;
  const spaceRight = window.innerWidth - dr.right - 14;
  const placeOnLeft =
    spaceRight < sW + 12
      ? true
      : spaceLeft < sW + 12
        ? false
        : dr.left > window.innerWidth * 0.45;

  const rawLeft = placeOnLeft ? dr.left - sW - 14 : dr.right + 14;
  const left = Math.max(12, Math.min(window.innerWidth - sW - 12, Math.round(rawLeft)));
  const top = Math.max(
    12,
    Math.min(window.innerHeight - sH - 12, Math.round(dr.top + Math.max(0, dr.height - sH - 16))),
  );
  speech.classList.toggle('is-tail-left', !placeOnLeft);
  speech.style.left = `${left}px`;
  speech.style.top = `${top}px`;
  speech.style.right = 'auto';
  speech.style.bottom = 'auto';
}

function clearActiveGuideOverlay(): void {
  if (!activeGuide) return;
  if (activeGuide.arrivalTimer !== null) window.clearTimeout(activeGuide.arrivalTimer);
  if (activeGuide.cursorFadeTimer !== null) window.clearTimeout(activeGuide.cursorFadeTimer);
  if (activeGuide.idleTimer !== null) window.clearTimeout(activeGuide.idleTimer);
  if (activeGuide.pulseTimer !== null) window.clearTimeout(activeGuide.pulseTimer);
  if (activeGuide.targetEl && activeGuide.onTargetInteract) {
    activeGuide.targetEl.removeEventListener('pointerdown', activeGuide.onTargetInteract, true);
    activeGuide.targetEl.removeEventListener('input', activeGuide.onTargetInteract, true);
    activeGuide.targetEl.removeEventListener('focus', activeGuide.onTargetInteract, true);
  }
  activeGuide.targetEl?.classList.remove('qv-course-pulse');
  activeGuide.cursorEl?.remove();
  activeGuide.rippleEl?.remove();
  activeGuide.speechEl?.remove();
  activeGuide = null;
}

export function closeInteractiveCourseDrawer(): void {
  clearActiveGuideOverlay();
  onActiveLessonMarkedDone = null;
  if (drawerResizeHandler && typeof window !== 'undefined') {
    window.removeEventListener('resize', drawerResizeHandler);
    drawerResizeHandler = null;
  }
  if (activeCourseDrawer) {
    activeCourseDrawer.remove();
    activeCourseDrawer = null;
  }
}

export function navigateToCourseLesson(
  actions: AppActions,
  lesson: CourseLesson,
  options?: { originEl?: HTMLElement | null },
): void {
  clearActiveGuideOverlay();

  // Capture origin rect BEFORE state navigation removes the source button from DOM
  const fallbackOriginX = typeof window !== 'undefined' ? Math.round(window.innerWidth * 0.5) : 320;
  const fallbackOriginY = typeof window !== 'undefined' ? Math.round(window.innerHeight * 0.45) : 260;
  const originRect = options?.originEl?.getBoundingClientRect();
  const originX =
    originRect && originRect.width > 0
      ? Math.round(originRect.left + Math.min(originRect.width * 0.65, 96))
      : fallbackOriginX;
  const originY =
    originRect && originRect.height > 0
      ? Math.round(originRect.top + originRect.height * 0.5)
      : fallbackOriginY;

  if (lesson.minTier === 'advanced' && actions.getState().settings.toolTier !== 'advanced') {
    actions.updateSettings({ toolTier: 'advanced' });
    actions.notify('Switched Workspace Layout to Full Studio for this lesson.');
  } else if (lesson.minTier === 'intermediate' && actions.getState().settings.toolTier === 'basic') {
    actions.updateSettings({ toolTier: 'intermediate' });
    actions.notify('Switched Workspace Layout to Editorial for this lesson.');
  }

  const nextSubMode =
    lesson.targetEditorSubMode ??
    (lesson.targetView === 'editor' && lesson.id.startsWith('m4-')
      ? lesson.id === 'm4-diff'
        ? 'diff'
        : 'proofread'
      : undefined);

  actions.setState(
    {
      activeView: lesson.targetView,
      ...(lesson.targetTypesetTab ? { typesetSubTab: lesson.targetTypesetTab } : {}),
      ...(nextSubMode ? { editorSubMode: nextSubMode } : {}),
      ...(lesson.targetSelector === '.bv-binder' ? { showBinder: true } : {}),
      ...(lesson.targetSelector === '.bv-inspector' ? { showInspector: true } : {}),
    },
    true,
  );

  const session: ActiveGuideSession = {
    lessonId: lesson.id,
    engaged: false,
    cursorEl: null,
    rippleEl: null,
    speechEl: null,
    arrivalTimer: null,
    cursorFadeTimer: null,
    idleTimer: null,
    pulseTimer: null,
    targetEl: null,
    onTargetInteract: null,
  };
  activeGuide = session;

  const dismissOverlay = () => {
    if (activeGuide !== session) return;
    session.engaged = true;
    if (session.idleTimer !== null) {
      window.clearTimeout(session.idleTimer);
      session.idleTimer = null;
    }
    session.speechEl?.remove();
    session.speechEl = null;
    session.cursorEl?.remove();
    session.cursorEl = null;
    session.rippleEl?.remove();
    session.rippleEl = null;
  };

  const handleFollowedInstruction = () => {
    if (activeGuide !== session || session.engaged) return;
    dismissOverlay();
    if (!readCompletedCourseLessons().has(lesson.id)) {
      if (onActiveLessonMarkedDone) {
        onActiveLessonMarkedDone(lesson.id, true);
      } else {
        toggleCourseLessonDone(lesson.id, true);
      }
      actions.notify(`Completed: ${lesson.title}`);
    }
  };

  requestAnimationFrame(() => {
    if (activeGuide !== session) return;
    const target = lesson.targetSelector
      ? document.querySelector<HTMLElement>(lesson.targetSelector)
      : null;

    let targetX = fallbackOriginX;
    let targetY = fallbackOriginY;

    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      const tr = target.getBoundingClientRect();
      // Smoothly move Practice Companion drawer away if it overlaps or blocks the target control
      dodgeDrawerFromRect(tr);

      target.classList.add('qv-course-pulse');
      session.targetEl = target;
      session.onTargetInteract = handleFollowedInstruction;
      target.addEventListener('pointerdown', handleFollowedInstruction, true);
      target.addEventListener('input', handleFollowedInstruction, true);
      target.addEventListener('focus', handleFollowedInstruction, true);

      targetX = Math.max(
        24,
        Math.min(window.innerWidth - 28, Math.round(tr.left + Math.min(tr.width * 0.42, 160))),
      );
      targetY = Math.max(
        24,
        Math.min(window.innerHeight - 64, Math.round(tr.top + Math.min(tr.height * 0.35, 96))),
      );

      session.pulseTimer = window.setTimeout(() => {
        target.classList.remove('qv-course-pulse');
      }, 4200);
    }

    // Spawn animated pointer cursor emerging from origin button toward target element
    const pointerSvg = svgEl('svg', {
      class: 'qv-guide-cursor-svg',
      width: 22,
      height: 22,
      viewBox: '0 0 24 24',
      fill: 'none',
      'aria-hidden': 'true',
    });
    pointerSvg.appendChild(
      svgEl('path', {
        d: 'M4 3L19.5 11.5L12.6 13.7L10.2 20.5L4 3Z',
        fill: '#d9a44b',
        stroke: '#121318',
        'stroke-width': '1.8',
        'stroke-linejoin': 'round',
      }),
    );

    const tagEl = el('span', { className: 'qv-guide-cursor-tag', text: `Try here: ${lesson.actionLabel}` });
    const cursorEl = el(
      'div',
      {
        className: 'qv-guide-cursor',
        style: {
          transform: `translate3d(${originX}px, ${originY}px, 0) scale(0.68)`,
          opacity: '0',
        },
        attrs: { 'aria-hidden': 'true' },
      },
      pointerSvg,
      tagEl,
    );
    document.body.appendChild(cursorEl);
    session.cursorEl = cursorEl;

    // Flip cursor tag to left side when near right edge of screen (and vice versa)
    const cursorW = cursorEl.offsetWidth > 0 ? cursorEl.offsetWidth : 210;
    const fitsRight = targetX + cursorW + 12 <= window.innerWidth;
    const fitsLeft = targetX - cursorW >= 12;
    const flipLeft = !fitsRight && (fitsLeft || targetX > window.innerWidth * 0.5);
    if (flipLeft) {
      cursorEl.classList.add('is-flip-left');
    }
    const rawDestX = flipLeft ? targetX - (cursorW - 6) : targetX;
    const destX = Math.max(12, Math.min(window.innerWidth - cursorW - 12, Math.round(rawDestX)));

    requestAnimationFrame(() => {
      if (activeGuide !== session) return;
      cursorEl.style.transform = `translate3d(${destX}px, ${targetY}px, 0) scale(1)`;
      cursorEl.style.opacity = '1';
    });

    session.arrivalTimer = window.setTimeout(() => {
      if (activeGuide !== session || session.engaged) return;
      cursorEl.classList.add('is-tapping');
      const rippleEl = el('div', {
        className: 'qv-guide-ripple',
        style: { left: `${targetX}px`, top: `${targetY}px` },
        attrs: { 'aria-hidden': 'true' },
      });
      document.body.appendChild(rippleEl);
      session.rippleEl = rippleEl;
      window.setTimeout(() => {
        rippleEl.remove();
        if (session.rippleEl === rippleEl) session.rippleEl = null;
      }, 900);
    }, 760);

    session.cursorFadeTimer = window.setTimeout(() => {
      if (activeGuide !== session) return;
      cursorEl.style.opacity = '0';
      window.setTimeout(() => {
        cursorEl.remove();
        if (session.cursorEl === cursorEl) session.cursorEl = null;
      }, 260);
    }, 5200);

    // 10-second gentle idle help speech dialog if user hasn't interacted or completed the step
    session.idleTimer = window.setTimeout(() => {
      if (activeGuide !== session || session.engaged) return;
      if (readCompletedCourseLessons().has(lesson.id)) return;

      const speech = el(
        'aside',
        {
          className: 'qv-guide-speech',
          id: 'qv-guide-speech-dialog',
          attrs: { role: 'dialog', 'aria-live': 'polite', 'aria-label': 'Tutorial Assistance' },
        },
        el(
          'div',
          { className: 'qv-guide-speech-head' },
          el('span', { className: 'qv-guide-speech-avatar' }, icon('course', 14)),
          el('strong', { text: "Hey, it seems you're lost, let me help you." }),
        ),
        el('p', {
          className: 'qv-guide-speech-body',
          text: lesson.steps[0] || lesson.instruction,
        }),
        el(
          'div',
          { className: 'qv-guide-speech-actions' },
          el('button', {
            className: 'bv-btn bv-btn-primary',
            text: 'Show Me Again',
            attrs: { type: 'button' },
            on: {
              click: () => {
                navigateToCourseLesson(actions, lesson, {
                  originEl: activeCourseDrawer,
                });
              },
            },
          }),
          el('button', {
            className: 'bv-mini-btn',
            text: 'Dismiss',
            attrs: { type: 'button' },
            on: {
              click: () => {
                dismissOverlay();
              },
            },
          }),
        ),
        el('span', { className: 'qv-guide-speech-tail', attrs: { 'aria-hidden': 'true' } }),
      );
      document.body.appendChild(speech);
      positionSpeechDialogBesideDrawer(speech);
      session.speechEl = speech;
    }, 10_000);
  });
}

/**
 * Compact side-by-side interactive practice drawer paired with the full /course Academy page.
 * Supports free viewport-clamped dragging, collapse/uncollapse, smart auto-dodge, and in-place completion.
 */
export function openInteractiveCourseDrawer(actions: AppActions, moduleIndex = 0): void {
  closeInteractiveCourseDrawer();
  activeModuleIndex = Math.max(0, Math.min(COURSE_MODULES.length - 1, moduleIndex));

  const drawer = el('aside', {
    className: `qv-course-drawer${drawerCollapsed ? ' is-collapsed' : ''}`,
    id: 'qv-course-drawer',
    attrs: { role: 'complementary', 'aria-label': 'Interactive Book Writing Course' },
  });

  if (drawerPos) {
    clampDrawerPosition(drawer, drawerPos.left, drawerPos.top);
  }

  const wireHeaderDrag = (headEl: HTMLElement) => {
    headEl.classList.add('qv-course-drag-head');
    headEl.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      if ((e.target as HTMLElement | null)?.closest('button')) return;
      e.preventDefault();
      const startRect = drawer.getBoundingClientRect();
      const startX = e.clientX;
      const startY = e.clientY;
      drawer.classList.add('is-dragging');

      const onMove = (mv: PointerEvent) => {
        clampDrawerPosition(
          drawer,
          startRect.left + (mv.clientX - startX),
          startRect.top + (mv.clientY - startY),
        );
      };
      const onUp = () => {
        drawer.classList.remove('is-dragging');
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        window.removeEventListener('pointercancel', onUp);
      };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onUp);
    });
  };

  const drawerRuntimePlatform: 'web' | 'desktop' = isTauriRuntime() ? 'desktop' : 'web';
  const drawerPlatformMatches = (m: CourseModule) => {
    const p = getModulePlatform(m);
    return p === 'both' || p === drawerRuntimePlatform;
  };
  if (!drawerPlatformMatches(COURSE_MODULES[activeModuleIndex])) {
    const firstValid = COURSE_MODULES.findIndex(drawerPlatformMatches);
    if (firstValid >= 0) activeModuleIndex = firstValid;
  }

  const renderDrawer = () => {
    drawer.replaceChildren();
    drawer.classList.toggle('is-collapsed', drawerCollapsed);
    const mod = COURSE_MODULES[activeModuleIndex];
    const done = readCompletedCourseLessons();
    const summary = getCourseCompletionSummary(drawerRuntimePlatform);

    const progressTagEl = el('span', {
      className: 'bv-mono-tag',
      text: `${summary.completed}/${summary.total} (${summary.pct}%)`,
    });

    const modPillBtns = new Map<number, HTMLButtonElement>();
    const modPills = el('div', { className: 'qv-course-mod-pills' });
    COURSE_MODULES.forEach((m, idx) => {
      if (!drawerPlatformMatches(m)) return;
      const modAllDone = m.lessons.every((l) => done.has(l.id));
      const pillBtn = el('button', {
        className: `bv-mini-btn${idx === activeModuleIndex ? ' is-active' : ''}${modAllDone ? ' is-mod-done' : ''}`,
        text: `${m.number}${modAllDone ? ' ✓' : ''}`,
        attrs: { type: 'button', 'aria-label': `Module ${m.number}: ${m.title}` },
        on: {
          click: () => {
            activeModuleIndex = idx;
            renderDrawer();
          },
        },
      });
      modPillBtns.set(idx, pillBtn);
      modPills.appendChild(pillBtn);
    });

    const cardControlByLesson = new Map<
      string,
      { card: HTMLElement; chk: HTMLInputElement; markBtn: HTMLButtonElement }
    >();

    const updateDoneInPlace = (lessonId: string, nextDone: boolean) => {
      const updatedDone = toggleCourseLessonDone(lessonId, nextDone);
      const nextSummary = getCourseCompletionSummary(drawerRuntimePlatform);
      progressTagEl.textContent = `${nextSummary.completed}/${nextSummary.total} (${nextSummary.pct}%)`;

      const ctrl = cardControlByLesson.get(lessonId);
      if (ctrl) {
        ctrl.card.classList.toggle('is-done', nextDone);
        ctrl.chk.checked = nextDone;
        ctrl.markBtn.classList.toggle('is-done', nextDone);
        ctrl.markBtn.textContent = nextDone ? 'Completed' : 'Mark Done';
      }

      const activePill = modPillBtns.get(activeModuleIndex);
      if (activePill) {
        const modAllDone = mod.lessons.every((l) => updatedDone.has(l.id));
        activePill.classList.toggle('is-mod-done', modAllDone);
        activePill.textContent = `${mod.number}${modAllDone ? ' ✓' : ''}`;
      }

      if (nextDone && activeGuide?.lessonId === lessonId) {
        if (activeGuide.idleTimer !== null) {
          window.clearTimeout(activeGuide.idleTimer);
          activeGuide.idleTimer = null;
        }
        activeGuide.speechEl?.remove();
        activeGuide.speechEl = null;
      }
    };

    onActiveLessonMarkedDone = updateDoneInPlace;

    const lessonList = el('div', { className: 'qv-course-lessons' });
    for (const lesson of mod.lessons) {
      const isDone = done.has(lesson.id);
      const chk = el('input', {
        attrs: { type: 'checkbox', checked: isDone, 'aria-label': `Complete ${lesson.title}` },
        on: {
          change: () => updateDoneInPlace(lesson.id, chk.checked),
        },
      });

      const actionBtn = el(
        'button',
        {
          className: 'bv-btn bv-btn-primary',
          style: { height: '26px', fontSize: '11.5px', padding: '0 10px' },
          attrs: { type: 'button' },
          on: {
            click: () => navigateToCourseLesson(actions, lesson, { originEl: actionBtn }),
          },
        },
        lesson.actionLabel,
      );

      const markBtn = el('button', {
        className: `bv-mini-btn${isDone ? ' is-done' : ''}`,
        text: isDone ? 'Completed' : 'Mark Done',
        attrs: { type: 'button' },
        on: {
          click: () => {
            const currentlyDone = readCompletedCourseLessons().has(lesson.id);
            updateDoneInPlace(lesson.id, !currentlyDone);
          },
        },
      });

      const card = el(
        'div',
        { className: `qv-course-lesson-card${isDone ? ' is-done' : ''}` },
        el(
          'div',
          { className: 'qv-course-lesson-head' },
          chk,
          el('strong', { text: lesson.title, style: { fontSize: '12.5px', flex: '1' } }),
          el('span', { className: 'bv-mono-tag', text: lesson.minTier.toUpperCase() }),
        ),
        el('p', {
          className: 'bv-label',
          text: lesson.instruction,
          style: { margin: '4px 0 8px', color: 'var(--text-secondary)' },
        }),
        el(
          'div',
          { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' } },
          actionBtn,
          markBtn,
        ),
      );

      cardControlByLesson.set(lesson.id, { card, chk, markBtn });
      lessonList.appendChild(card);
    }

    const headEl = el(
      'div',
      { className: 'bv-panel-head' },
      el(
        'div',
        { style: { display: 'flex', alignItems: 'center', gap: '6px' } },
        icon('course', 15),
        el('span', { className: 'bv-panel-title', text: 'Practice Companion' }),
      ),
      el(
        'div',
        { style: { display: 'flex', alignItems: 'center', gap: '6px' } },
        progressTagEl,
        el('button', {
          className: 'bv-mini-btn',
          text: drawerCollapsed ? '+' : '−',
          attrs: {
            type: 'button',
            'aria-label': drawerCollapsed ? 'Expand Practice Companion' : 'Collapse Practice Companion',
            title: drawerCollapsed ? 'Expand Practice Companion' : 'Collapse Practice Companion',
          },
          on: {
            click: () => {
              drawerCollapsed = !drawerCollapsed;
              drawer.classList.toggle('is-collapsed', drawerCollapsed);
              const toggleBtn = drawer.querySelector<HTMLButtonElement>(
                'button[aria-label$="Practice Companion"]',
              );
              if (toggleBtn) {
                toggleBtn.textContent = drawerCollapsed ? '+' : '−';
                toggleBtn.setAttribute(
                  'aria-label',
                  drawerCollapsed ? 'Expand Practice Companion' : 'Collapse Practice Companion',
                );
              }
              if (drawerPos) {
                requestAnimationFrame(() => {
                  if (drawerPos) clampDrawerPosition(drawer, drawerPos.left, drawerPos.top);
                });
              }
            },
          },
        }),
        el('button', {
          className: 'bv-mini-btn',
          text: 'Full Course',
          attrs: { type: 'button' },
          on: {
            click: () => {
              closeInteractiveCourseDrawer();
              actions.openCoursePage(mod.id);
            },
          },
        }),
        el('button', {
          className: 'bv-mini-btn',
          text: '×',
          attrs: { type: 'button', 'aria-label': 'Close Practice Companion' },
          on: { click: closeInteractiveCourseDrawer },
        }),
      ),
    );
    wireHeaderDrag(headEl);

    drawer.append(
      headEl,
      el(
        'div',
        { className: 'qv-course-body' },
        modPills,
        el('h4', { text: `Module ${mod.number}: ${mod.title}`, style: { margin: '6px 0 2px', fontSize: '14px' } }),
        el('p', { className: 'bv-label', text: mod.summary, style: { margin: '0 0 8px' } }),
        lessonList,
      ),
      el(
        'div',
        { className: 'qv-course-footer' },
        el('button', {
          className: 'bv-btn',
          text: 'Previous Module',
          attrs: { type: 'button', disabled: activeModuleIndex === 0 },
          on: {
            click: () => {
              activeModuleIndex = Math.max(0, activeModuleIndex - 1);
              renderDrawer();
            },
          },
        }),
        el('button', {
          className: 'bv-btn bv-btn-primary',
          text: activeModuleIndex < COURSE_MODULES.length - 1 ? 'Next Module ->' : 'Finish Course',
          attrs: { type: 'button' },
          on: {
            click: () => {
              if (activeModuleIndex < COURSE_MODULES.length - 1) {
                activeModuleIndex++;
                renderDrawer();
              } else {
                closeInteractiveCourseDrawer();
                actions.notify('You completed all Quillvibe book-writing modules.');
              }
            },
          },
        }),
      ),
    );
  };

  activeCourseDrawer = drawer;
  document.body.appendChild(drawer);
  renderDrawer();
  if (drawerPos) {
    requestAnimationFrame(() => {
      if (drawer.isConnected && drawerPos) {
        clampDrawerPosition(drawer, drawerPos.left, drawerPos.top);
      }
    });
  }
  if (typeof window !== 'undefined') {
    drawerResizeHandler = () => {
      if (drawer.isConnected && drawerPos) {
        clampDrawerPosition(drawer, drawerPos.left, drawerPos.top);
      }
    };
    window.addEventListener('resize', drawerResizeHandler);
  }
}
