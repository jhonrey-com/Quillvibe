import { defaultBookCover } from './cover';
import { applyAutoLayout, seedGraphFromProject } from './graph';
import type { BookProject } from './types';

export function createStarterBookProject(): BookProject {
  const project: BookProject = {
    id: 'proj-salt-cartographer',
    title: 'The Salt Cartographer',
    subtitle: 'A Novel of Tides and Meridian Stones',
    author: 'Maren Lindqvist',
    dedication: 'For everyone who keeps paper notebooks by the harbor light.',
    copyrightNotice: 'Copyright © 2026 Maren Lindqvist. All rights reserved.',
    language: 'en',
    wordTarget: 65000,
    paperTheme: 'ivory',
    activeAuthorLabel: 'Maren Lindqvist',
    authorIdentity: {
      penName: 'Maren Lindqvist',
      signatureText: 'Maren Lindqvist',
      signatureSvgDataUrl: '',
      authorKeyId: '',
      publicKeyJwk: '',
      lastSignedAt: '',
      manuscriptDigest: '',
      keyLockedForever: false,
    },
    collaborators: [
      {
        id: 'collab-soren',
        name: 'Soren Halvorsen',
        penName: 'S. Halvorsen',
        role: 'co-author',
        creditLine: 'Co-Author (Maritime Research & Part II)',
        authorKeyId: 'QVK-92F0A31B8840',
        color: '#6b9cd4',
        addedAt: '2026-11-18T10:00:00.000Z',
      },
      {
        id: 'collab-anya',
        name: 'Anya Lind',
        penName: 'Anya Lind',
        role: 'proofreader',
        creditLine: 'Proofreader & Continuity Check',
        authorKeyId: 'QVK-71C4E9120A33',
        color: '#67b08c',
        addedAt: '2026-11-20T14:20:00.000Z',
      },
    ],
    typography: {
      trimSize: '6x9',
      fontFamily: 'garamond',
      fontSizePt: 11,
      lineHeight: 1.55,
      marginInches: 0.85,
      dropCaps: true,
      smartTypography: true,
      chapterNumeralStyle: 'roman',
      runningHeader: true,
      includeFrontMatter: true,
      includeTableOfContents: true,
      includePageNumbers: true,
    },
    parts: [
      {
        id: 'part-1',
        title: 'Part I — Low Water',
        collapsed: false,
        chapters: [
          {
            id: 'chap-1',
            title: 'The Brass Astrolabe',
            subtitle: 'Where the outer reef shifts overnight',
            collapsed: false,
            scenes: [
              {
                id: 'scene-1',
                title: 'Harbor Bell at Dawn',
                synopsis:
                  'Tomas inspects the tide gauge at Skerry Reach and finds an uncharted limestone shoal.',
                status: 'revision',
                pov: 'Tomas Vance',
                location: 'Skerry Reach Lighthouse',
                timeline: 'Day 1, 05:40',
                wordTarget: 1200,
                content:
                  'Before the fog bell struck five, Tomas Vance knelt beside the iron tide-well with a caliper and a salt-stained ledger. Yesterday the southern channel had measured nine fathoms at slack water.\n\nThis morning the brass plumb line stopped short at four.\n\n* * *\n\n"Either the basin is rising," Clara Holm said from the lantern stair, holding an unlit storm lamp, "or the chart room at Brinehaven lost half its ink."\n\nTomas wiped brine from the Margin Sextant and marked the sounding in red graphite. Out beyond the breakwater, the outer bell tolled twice off-beat—an unmistakable warning that the limestone shelf had shifted again.',
                notes:
                  'Establish the tactile weight of Tomas’s surveying tools and his longstanding trust with Clara.',
                snapshots: [
                  {
                    id: 'snap-1',
                    createdAt: '2026-11-20T09:15:00.000Z',
                    label: 'First Cold Draft',
                    content:
                      'Tomas Vance checked the tide-well at dawn. The southern channel had fallen from nine fathoms to four overnight.',
                    wordCount: 18,
                  },
                ],
                annotations: [
                  {
                    id: 'ann-sample-1',
                    authorName: 'Anya Lind',
                    role: 'proofreader',
                    quote: 'limestone shelf had shifted again',
                    suggestion: 'limestone shoal had crept another fathom east',
                    note: 'Matches the fathom sounding reported at the opening paragraph.',
                    status: 'open',
                    createdAt: '2026-11-21T16:10:00.000Z',
                  },
                ],
                updatedAt: '2026-11-22T12:00:00.000Z',
              },
              {
                id: 'scene-2',
                title: "The Chartmaker's Apprentice",
                synopsis:
                  'In the Brinehaven Archive, Henrik reveals a century-old survey map sealed in beeswax.',
                status: 'draft',
                pov: 'Clara Holm',
                location: 'Brinehaven Archive',
                timeline: 'Day 1, 10:15',
                wordTarget: 1400,
                content:
                  'The vaulted shelves of Brinehaven Archive smelled of cedar oil and dry kelp. Henrik Nystrom laid the cylinder onto the oak table and cracked its grey wax seal with a bone folder.\n\n"My grandfather drew this shoreline after the winter gale of 1841," Henrik murmured. "Look at the Margin Sextant bearings along the western shoal. The island did not sink—it turned."',
                notes: 'Keep Henrik cautious; he distrusts Admiralty clerks.',
                snapshots: [],
                annotations: [],
                updatedAt: '2026-11-22T12:15:00.000Z',
              },
            ],
          },
          {
            id: 'chap-2',
            title: 'Meridian Stones',
            subtitle: 'Northward across the black kelp flats',
            collapsed: false,
            scenes: [
              {
                id: 'scene-3',
                title: 'Crossing the Causeway',
                synopsis:
                  'Tomas and Clara cross the exposed tidal road before the afternoon bore returns.',
                status: 'outline',
                pov: 'Tomas Vance',
                location: 'The Black Causeway',
                timeline: 'Day 2, 14:30',
                wordTarget: 1500,
                content:
                  'By two o’clock the mudflats steamed under pale autumn sun. Tomas slung the copper sounding reel over his shoulder while Clara checked the pocket barometer.\n\nTwo miles ahead, the first Meridian Stone jutted out of the wet basalt like a broken mast.',
                notes: 'Pace accelerates as the six-hour tidal window closes.',
                snapshots: [],
                annotations: [],
                updatedAt: '2026-11-22T12:30:00.000Z',
              },
            ],
          },
        ],
      },
      {
        id: 'part-2',
        title: 'Part II — The Equinoctial Bore',
        collapsed: false,
        chapters: [
          {
            id: 'chap-3',
            title: 'Soundings in Grey Fog',
            subtitle: 'The outer stacks at midnight',
            collapsed: false,
            scenes: [
              {
                id: 'scene-4',
                title: 'Lanterns on the Shoal',
                synopsis:
                  'Henrik brings the 1841 copperplate log aboard as the spring tide crests.',
                status: 'draft',
                pov: 'Tomas Vance',
                location: 'Skerry Reach Lighthouse',
                timeline: 'Day 3, 22:10',
                wordTarget: 1800,
                content:
                  'Water climbed the lower granite steps three minutes ahead of the Admiralty almanac. From the gallery rail, Clara held the green signal glass while Tomas compared the Meridian Stone azimuth against Henrik’s folio.',
                notes: 'Tie back to the opening sounding measurement from Chapter I.',
                snapshots: [],
                annotations: [],
                updatedAt: '2026-11-22T13:00:00.000Z',
              },
            ],
          },
        ],
      },
    ],
    bible: {
      characters: [
        {
          id: 'char-tomas',
          name: 'Tomas Vance',
          aliases: 'Tomas, Vance, The Surveyor',
          role: 'Protagonist — Senior Hydrographer',
          motivation:
            'Prove the archipelago seabed shifts along predictable fault lines before winter shipping resumes.',
          appearance:
            'Weathered wool peacoat, ink-stained knuckles, brass caliper on a leather lanyard.',
          notes: 'Lost his first sloop off the Outer Stacks seven years prior.',
          customFields: [{ key: 'Vessel', value: 'Sloop Shearwater' }],
        },
        {
          id: 'char-clara',
          name: 'Clara Holm',
          aliases: 'Clara, Keeper Holm',
          role: 'Deuteragonist — Lighthouse Keeper',
          motivation:
            'Protect coastal villages from inaccurate Admiralty shipping lanes.',
          appearance:
            'Tall, silver-streaked braid, carries a storm lamp and tide tables.',
          notes: 'Knows every reef current within thirty leagues of Skerry Reach.',
          customFields: [{ key: 'Signal Code', value: 'Green Glass (3-4-1)' }],
        },
        {
          id: 'char-henrik',
          name: 'Henrik Nystrom',
          aliases: 'Henrik, The Archivist',
          role: 'Ally — Chief Chart Archivist',
          motivation: 'Preserve pre-Admiralty survey ledgers hidden in Brinehaven.',
          appearance: 'Spectacles mended with copper wire, linen apron over tweed.',
          notes: 'Grandson of the 1841 expedition draughtsman.',
          customFields: [],
        },
      ],
      locations: [
        {
          id: 'loc-skerry',
          name: 'Skerry Reach Lighthouse',
          region: 'Outer Archipelago',
          atmosphere:
            'Salt-crusted granite tower overlooking two colliding tidal currents.',
          notes: 'Contains the oldest working mercury tide-well on the coast.',
          customFields: [],
        },
        {
          id: 'loc-brinehaven',
          name: 'Brinehaven Archive',
          region: 'Inner Harbor',
          atmosphere:
            'Cedar-lined vault packed with copperplate charts and wax-sealed logbooks.',
          notes: 'Built inside a retired customs house above the dry dock.',
          customFields: [],
        },
        {
          id: 'loc-causeway',
          name: 'The Black Causeway',
          region: 'Mid-Channel Flats',
          atmosphere: 'Basalt cobble road exposed only six hours between tides.',
          notes: 'Marked by twelve carved Meridian Stones.',
          customFields: [],
        },
      ],
      lore: [
        {
          id: 'lore-sextant',
          name: 'Margin Sextant',
          category: 'Instrument',
          summary:
            'A dual-mirror brass surveying sextant calibrated specifically for shallow coastal reefs.',
          notes: 'Engraved with three unknown meridian benchmarks.',
          customFields: [],
        },
        {
          id: 'lore-meridian',
          name: 'Meridian Stone',
          category: 'Monument',
          summary:
            'Basalt obelisks erected by early cartographers to measure long-term seabed drift.',
          notes: 'Only fully exposed during spring equinoctial low tides.',
          customFields: [],
        },
      ],
      customCategories: [
        {
          id: 'cat-tides',
          name: 'Tides & Signals',
          description: 'Almanac tables, reef currents, and lantern codes across the archipelago.',
        },
      ],
      customEntries: [
        {
          id: 'cust-equinox-bore',
          categoryId: 'cat-tides',
          name: 'Equinoctial Spring Bore',
          subtitle: 'Biannual Tidal Surge',
          summary: 'A six-foot returning tide wall sweeping across The Black Causeway.',
          notes: 'Leaves exposed basalt slick for forty minutes after cresting.',
          customFields: [{ key: 'Cycle', value: 'Spring & Autumn Equinox' }],
        },
      ],
    },
  };

  const graph = seedGraphFromProject(project);
  graph.nodes.push({
    id: 'gnode-plot-reveal',
    kind: 'plot',
    label: '1841 Chart Rotation',
    subtitle: 'Act I Turning Point',
    x: 460,
    y: 280,
    color: '#d4827d',
    notes: 'The archipelago seabed rotates slowly rather than sinking.',
  });
  graph.edges.push({
    id: 'gedge-plot-sextant',
    sourceId: 'gnode-char-tomas',
    targetId: 'gnode-plot-reveal',
    label: 'uncovers',
    style: 'solid',
    color: '#c7a97b',
  });
  graph.edges.push({
    id: 'gedge-plot-henrik',
    sourceId: 'gnode-char-henrik',
    targetId: 'gnode-plot-reveal',
    label: 'guards proof of',
    style: 'dashed',
    color: '#6b9cd4',
  });
  project.storyGraph = applyAutoLayout(graph);
  project.cover = defaultBookCover(project);
  return project;
}

export const WELCOME_INTRO_BOOK_ID = 'book-quillvibe-welcome';

/**
 * Keeps the mock sample novel active on localhost dev/preview and unit tests,
 * while public website and installed desktop releases start with a clean intro workspace.
 */
export function isLocalDevMockEnabled(): boolean {
  const env = (import.meta as { env?: { MODE?: string } }).env;
  if (env?.MODE === 'test') return true;
  if (typeof window === 'undefined' || !window.location) return false;
  const { protocol, hostname, port } = window.location;
  if (protocol === 'tauri:') return false;
  const host = hostname.toLowerCase();
  if (host === 'tauri.localhost') return false;
  return Boolean(port) && (host === 'localhost' || host === '127.0.0.1' || host === '[::1]');
}

/**
 * Clean introductory book shown to public web and desktop writers on first launch.
 */
export function createWelcomeIntroBookProject(): BookProject {
  const now = new Date().toISOString();
  const introText = [
    'Replace this page with your opening chapter, or click New Blank Book in Library when you want a fresh title.',
    '',
    '## Quick Start',
    '',
    '- **Rename Parts & Chapters:** Double-click any Part or Chapter title in the left Manuscript Binder, or right-click to rename, add scenes, or lock finished drafts.',
    '- **Switch Workspace Layouts:** Click the Workspace badge in the bottom bar to move between Focused (single drafting page), Editorial (Corkboard, Outline, Proofread, Typeset), and Full Studio (Story Bible, Story Graph, Book Cover Studio).',
    '- **Search Anywhere:** Press Ctrl+K (or Cmd+K on Mac) to jump between scenes, Story Bible entries, FAQ articles, tools, and Academy lessons.',
    '- **Save Backups:** Click Save (Ctrl+S) in the top bar to save or download a protected .qv archive containing your manuscript, Story Bible, graph, and cover.',
  ].join('\n');

  const project: BookProject = {
    id: WELCOME_INTRO_BOOK_ID,
    title: 'Welcome to Quillvibe',
    subtitle: '',
    author: 'Author',
    dedication: '',
    copyrightNotice: `Copyright © ${new Date().getFullYear()} Author. All rights reserved.`,
    language: 'en',
    wordTarget: 50000,
    paperTheme: 'ivory',
    activeAuthorLabel: 'Author',
    authorIdentity: {
      penName: 'Author',
      signatureText: 'Author',
      signatureSvgDataUrl: '',
      authorKeyId: '',
      publicKeyJwk: '',
      lastSignedAt: '',
      manuscriptDigest: '',
      keyLockedForever: false,
    },
    collaborators: [],
    publishing: {
      imprintName: 'Independent',
      isbn: '',
      editionNumber: '1st Edition',
      editorialStage: 'developmental',
    },
    updatedAt: now,
    typography: {
      trimSize: '6x9',
      fontFamily: 'garamond',
      fontSizePt: 11,
      lineHeight: 1.55,
      marginInches: 0.85,
      dropCaps: true,
      smartTypography: true,
      chapterNumeralStyle: 'roman',
      runningHeader: true,
      includeFrontMatter: true,
      includeTableOfContents: true,
      includePageNumbers: true,
    },
    parts: [
      {
        id: 'part-welcome-1',
        title: 'Part I',
        collapsed: false,
        chapters: [
          {
            id: 'chap-welcome-1',
            title: 'Chapter 1',
            subtitle: 'Getting Started',
            collapsed: false,
            scenes: [
              {
                id: 'scene-welcome-1',
                title: 'Start Writing',
                synopsis: 'Quick introduction to drafting, organizing, and exporting in Quillvibe.',
                status: 'draft',
                pov: '',
                location: '',
                timeline: '',
                wordTarget: 1000,
                content: introText,
                notes: '',
                snapshots: [],
                proofreadMarks: [],
                annotations: [],
                updatedAt: now,
              },
            ],
          },
        ],
      },
    ],
    bible: {
      characters: [],
      locations: [],
      lore: [],
      customCategories: [],
      customEntries: [],
    },
  };

  project.storyGraph = seedGraphFromProject(project);
  project.cover = defaultBookCover(project);
  return project;
}
