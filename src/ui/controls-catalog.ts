export type ControlCategory =
  | 'Topbar & Window'
  | 'Editor & Proofread'
  | 'Bottom Sprint Bar'
  | 'Corkboard, Outline & Bible'
  | 'Story Graph'
  | 'Typeset & Cover'
  | 'Settings & Sync';

export type ControlType =
  | 'Button'
  | 'Dropdown'
  | 'Slider'
  | 'Lever'
  | 'Checkbox'
  | 'Canvas Control'
  | 'Section';

export interface ControlReferenceItem {
  id: string;
  name: string;
  category: ControlCategory;
  controlType: ControlType;
  location: string;
  summary: string;
  howToUse: string;
  keywords: string;
}

export const CONTROL_CATEGORIES: readonly ControlCategory[] = [
  'Topbar & Window',
  'Bottom Sprint Bar',
  'Editor & Proofread',
  'Corkboard, Outline & Bible',
  'Story Graph',
  'Typeset & Cover',
  'Settings & Sync',
] as const;

export const CONTROL_REFERENCE_ITEMS: readonly ControlReferenceItem[] = [
  // Topbar & Window
  {
    id: 'ctrl-logo',
    name: 'Quillvibe Top-Left Emblem',
    category: 'Topbar & Window',
    controlType: 'Section',
    location: 'Upper-left header bar',
    summary: 'Transparent open-folio emblem marking the application header.',
    howToUse: 'Displayed beside the Binder button. Inside desktop builds, drag the header strip around empty space to move the frameless window.',
    keywords: 'logo icon brand header frameless titlebar quillvibe',
  },
  {
    id: 'ctrl-binder-toggle',
    name: 'Manuscript Binder Toggle',
    category: 'Topbar & Window',
    controlType: 'Button',
    location: 'Topbar left',
    summary: 'Shows or hides the Parts, Chapters, and Scenes tree on the left.',
    howToUse: 'Click to expand or collapse the Binder sidebar. On narrow screens below 960px, opens as a slide-over drawer.',
    keywords: 'binder panel sidebar drawer tree chapters scenes',
  },
  {
    id: 'ctrl-title-input',
    name: 'Book Title Field & Save Indicator',
    category: 'Topbar & Window',
    controlType: 'Section',
    location: 'Topbar left next to Binder toggle',
    summary: 'Renames the active manuscript inline and shows local auto-save state.',
    howToUse: 'Edit text and press Enter or click away to rename the open book. Fixed-width Saved / Saving indicator updates in place without shifting neighboring controls.',
    keywords: 'title rename book saved saving indicator header',
  },
  {
    id: 'ctrl-workspace-switcher',
    name: 'Studio Workspace Switcher (Liquid Glass Bar)',
    category: 'Topbar & Window',
    controlType: 'Section',
    location: 'Topbar center',
    summary: 'Six-way workspace switcher between Manuscript, Corkboard, Outline, Story Bible, Story Graph, and Typeset.',
    howToUse: 'Click any icon or drag horizontally across segments to switch workspaces with centered inside-corner refraction.',
    keywords: 'manuscript corkboard outline bible graph typeset tabs switcher liquid glass',
  },
  {
    id: 'ctrl-library-btn',
    name: 'Book Library & Author Identity',
    category: 'Topbar & Window',
    controlType: 'Button',
    location: 'Topbar right',
    summary: 'Switches between books and configures per-book Pen Names, Signatures, and ECDSA Author Keys.',
    howToUse: 'Click to create, duplicate, or switch books, draw handwritten signatures, or rotate/verify signing keys.',
    keywords: 'library multiple books pen name signature author key ecdsa',
  },
  {
    id: 'ctrl-collab-btn',
    name: 'Offline Collaboration & Credits',
    category: 'Topbar & Window',
    controlType: 'Button',
    location: 'Topbar right',
    summary: 'Adds co-authors/proofreaders and syncs drafts over same-Wi-Fi LAN PIN or Bluetooth.',
    howToUse: 'Manage credited roles, start or join a local Wi-Fi PIN host without internet, or export/merge signed peer packages.',
    keywords: 'collaborate wifi lan pin bluetooth co-author proofreader credit sync offline',
  },
  {
    id: 'ctrl-open-btn',
    name: 'Open File Button',
    category: 'Topbar & Window',
    controlType: 'Button',
    location: 'Topbar right (Ctrl+O)',
    summary: 'Opens protected Quillvibe QVBX files (.qv, .qvbible, .qvscene, .qvstyle) or .qvext bundles.',
    howToUse: 'Click or press Ctrl+O to decode a saved book, component, or extension from disk. Legacy .quillvibe / .bookvibe files are imported from Settings -> Publishing & Migration.',
    keywords: 'open file load qv qvbible qvscene qvstyle qvext drag drop ctrl+o',
  },
  {
    id: 'ctrl-save-split',
    name: 'Save Button & Default Extension Dropdown',
    category: 'Topbar & Window',
    controlType: 'Dropdown',
    location: 'Topbar right (Ctrl+S)',
    summary: 'Exports immediately in the extension chosen in the split dropdown (.qv, .pdf, .epub, .md, .html, .txt, .qv*).',
    howToUse: 'Pick your preferred default file format from the dropdown next to the disk icon; your selection stays saved across sessions.',
    keywords: 'save export format dropdown pdf epub md html txt qv qvscene qvbible qvstyle',
  },
  {
    id: 'ctrl-extensions-btn',
    name: 'Extensions & Official File Formats',
    category: 'Topbar & Window',
    controlType: 'Button',
    location: 'Topbar right',
    summary: 'Opens Integrated toolkits, permission-gated External (.qvext) Sandbox, Audit Log, and format overview.',
    howToUse: 'Toggle built-in proofing/cleanup/readability/font modules or review SHA-256 checksums and permissions for third-party .qvext files.',
    keywords: 'extensions plugins qvext permissions audit sandbox mime associations',
  },
  {
    id: 'ctrl-settings-btn',
    name: 'Settings & Preferences Button',
    category: 'Topbar & Window',
    controlType: 'Button',
    location: 'Topbar right (Sliders icon)',
    summary: 'Configures custom fonts, editor typography sliders, UI density, spellcheck toggle, .docx/.html migration, imprint metadata, and developer info.',
    howToUse: 'Click to install local .ttf/.otf/.woff2 fonts, adjust paper width/line spacing, toggle spellcheck, or import .docx and Web HTML files.',
    keywords: 'settings preferences custom fonts ttf otf woff2 migration docx spellcheck developer',
  },
  {
    id: 'ctrl-help-btn',
    name: 'Help & Searchable Reference Button',
    category: 'Topbar & Window',
    controlType: 'Button',
    location: 'Topbar right (F1)',
    summary: 'Opens this full searchable manual, icon legend, controls guide, shortcuts, and section tour replay.',
    howToUse: 'Click ? or press F1 anytime to search every slider, lever, dropdown, icon, and workflow.',
    keywords: 'help f1 manual search guide faq walkthrough',
  },
  {
    id: 'ctrl-inspector-toggle',
    name: 'Scene Inspector Toggle',
    category: 'Topbar & Window',
    controlType: 'Button',
    location: 'Topbar right',
    summary: 'Shows or hides the right-hand Scene Inspector panel across every studio workspace.',
    howToUse: 'Works in Manuscript, Corkboard, Outline, Story Bible, Story Graph, and Typeset without clearing draft cursor state.',
    keywords: 'inspector panel metadata notes mentions snapshots toggle show hide',
  },
  {
    id: 'ctrl-window-chrome',
    name: 'Frameless Window Controls (Minimize, Maximize, Close)',
    category: 'Topbar & Window',
    controlType: 'Button',
    location: 'Desktop app upper-right corner',
    summary: 'Custom obsidian window frame buttons replacing the native OS title bar in Windows, macOS, and Linux builds.',
    howToUse: 'Drag empty topbar space to move the window, double-click to maximize/restore, or click − / □ / × directly. Hidden when running in web browsers.',
    keywords: 'titlebar frameless minimize maximize restore close desktop window drag',
  },

  // Bottom Sprint Bar
  {
    id: 'ctrl-word-ledger',
    name: 'Bottom Word, Page & Scene Metrics Ledger',
    category: 'Bottom Sprint Bar',
    controlType: 'Section',
    location: 'Bottom-left status bar',
    summary: 'Displays live Scene words & characters, Chapter words, Book progress against target, estimated print pages, and reading time.',
    howToUse: 'Updates cleanly on every keystroke as you write or edit scenes (~250 words per standard trade page).',
    keywords: 'word count character page count reading time status bar bottom left',
  },
  {
    id: 'ctrl-sprint-duration',
    name: 'Sprint Duration Selector (15m / 25m / 45m)',
    category: 'Bottom Sprint Bar',
    controlType: 'Dropdown',
    location: 'Bottom-right sprint bar next to clock icon',
    summary: 'Sets the countdown length of your focused writing sprint timer in minutes (15m, 25m, or 45m).',
    howToUse: 'Choose 15m, 25m, or 45m before or between sessions. Selecting a new duration resets the timer cleanly to that length and baselines starting words.',
    keywords: '15m 25m 45m dropdown timer sprint duration bottom right pomodoro clock',
  },
  {
    id: 'ctrl-sprint-start',
    name: 'Sprint Start / Pause Button',
    category: 'Bottom Sprint Bar',
    controlType: 'Button',
    location: 'Bottom-right sprint bar next to duration dropdown',
    summary: 'Starts or pauses the writing sprint countdown and tracks live net words gained (+0w).',
    howToUse: 'Click Start to begin counting down and measuring newly drafted words. While active, the label changes to Pause so you can freeze and resume without losing elapsed progress.',
    keywords: 'start pause sprint timer writing session net words bottom right',
  },
  {
    id: 'ctrl-sprint-reset',
    name: 'Sprint Reset Button',
    category: 'Bottom Sprint Bar',
    controlType: 'Button',
    location: 'Bottom-right sprint bar far right',
    summary: 'Stops any active sprint, restores the countdown to the chosen duration, and resets the net word counter (+0w).',
    howToUse: 'Click Reset whenever starting a fresh sprint interval or clearing an interrupted session back to 15:00 / 25:00 / 45:00.',
    keywords: 'reset sprint timer stop clear net words bottom right',
  },

  // Editor & Proofread
  {
    id: 'ctrl-editor-modes',
    name: 'Editor Sub-Mode Switcher (Draft, Proofread, Split View, Revision Diff)',
    category: 'Editor & Proofread',
    controlType: 'Section',
    location: 'Inside top header of active paper sheet',
    summary: 'Switches between raw prose writing, 15 copyediting marks, side-by-side Story Bible/scene reference, and snapshot word diffs.',
    howToUse: 'Select Draft for writing, Proofread for strikeout/caret/stet marks, Split View for reference cards, or Diff to compare against snapshots.',
    keywords: 'draft proofread split view revision diff editor modes',
  },
  {
    id: 'ctrl-format-buttons',
    name: 'Markdown Formatting Strip (B, I, H2, Quote, Scene Break, Split Scene)',
    category: 'Editor & Proofread',
    controlType: 'Button',
    location: 'Editor sub-toolbar left',
    summary: 'Inserts Markdown emphasis (**bold**, *italic*), headings, epigraph blockquotes, * * * scene breaks, or splits one scene into two.',
    howToUse: 'Select prose first for B/I or place the cursor at a transition line before clicking Split Scene.',
    keywords: 'bold italic heading h2 quote blockquote scene break split cursor formatting',
  },
  {
    id: 'ctrl-paper-theme',
    name: 'Paper Sheet Theme Dropdown (Obsidian, Parchment, Ivory)',
    category: 'Editor & Proofread',
    controlType: 'Dropdown',
    location: 'Editor sub-toolbar right',
    summary: 'Changes the writing surface palette between dark Obsidian obsidian-slate, warm Parchment paper, and crisp Ivory paper.',
    howToUse: 'Saved per book project without affecting print/EPUB export styling.',
    keywords: 'obsidian parchment ivory paper theme dark warm background dropdown',
  },
  {
    id: 'ctrl-typewriter-zen-snap',
    name: 'Typewriter, Zen Focus & Snapshot Capture Buttons',
    category: 'Editor & Proofread',
    controlType: 'Button',
    location: 'Editor sub-toolbar right',
    summary: 'Adds centered vertical cushion padding (Typewriter), hides sidebars (Zen, Ctrl+Shift+F), or saves an immutable Snapshot (Camera / Ctrl+S).',
    howToUse: 'Use Snapshots freely before major edits; restoring any snapshot backs up current text automatically.',
    keywords: 'typewriter zen focus camera snapshot backup ctrl+s',
  },
  {
    id: 'ctrl-proofread-marks',
    name: '15 Proofreading Mark Tools & Clean Preview',
    category: 'Editor & Proofread',
    controlType: 'Button',
    location: 'Proofread mode sub-toolbar & ledger',
    summary: 'Applies cross-out (₰), caret (∧), substitute (⇄), margin comment (AQ), highlight (★), transpose (tr), stet, paragraph split/join, case, and weight marks.',
    howToUse: 'Highlight text on the proof sheet and click a symbol, or enter a phrase in Quick Mark. Toggle Clean Preview to read accepted prose before committing.',
    keywords: 'proofread marks delete caret substitute comment stet transpose clean preview accept reject',
  },

  // Corkboard, Outline & Story Bible
  {
    id: 'ctrl-corkboard-outline',
    name: 'Corkboard Cards & Outline Filter Bar',
    category: 'Corkboard, Outline & Bible',
    controlType: 'Section',
    location: 'Corkboard & Outline workspaces',
    summary: 'Visual index cards for synopses/targets and sortable/filterable manuscript progress ledger.',
    howToUse: 'Drag scene cards on Corkboard to reorder chapters, or filter by status/POV/search text in Outline.',
    keywords: 'corkboard outline cards synopsis drag order filter table',
  },
  {
    id: 'ctrl-bible-tools',
    name: 'Story Bible Tabs, Custom Traits & Image Drop Zones',
    category: 'Corkboard, Outline & Bible',
    controlType: 'Canvas Control',
    location: 'Story Bible workspace',
    summary: 'Stores Characters, Locations, Lore, user-defined custom categories, arbitrary key/value rows, and reference portraits.',
    howToUse: 'Drag any portrait PNG/JPG onto a card image slot or add custom categories (Factions, Ships, Spells) in the left tab bar.',
    keywords: 'story bible characters locations lore custom categories traits portrait image',
  },

  // Story Graph
  {
    id: 'ctrl-graph-toolbar',
    name: 'Story Graph Density, Edge Style, Layout & Export Bar',
    category: 'Story Graph',
    controlType: 'Dropdown',
    location: 'Story Graph sub-toolbar',
    summary: 'Switches card detail level (Detailed / Standard / Compact), line routing (Curved / Step / Straight), and layouts (Columns / Radial / Timeline Flow).',
    howToUse: 'Switch to Compact for large 40-node casts, Radial to inspect central protagonist links, or click SVG to export vector artwork.',
    keywords: 'story graph compact standard detailed curved step straight radial flow svg zoom fit grid labels',
  },
  {
    id: 'ctrl-graph-canvas',
    name: 'Infinite Story Graph Canvas, Live Drag & Detachable Node Properties',
    category: 'Story Graph',
    controlType: 'Canvas Control',
    location: 'Story Graph board & sidebar',
    summary: 'Infinite boundless canvas with live 60fps edge routing, hover port dots (●), and detachable/collapsible Node Properties.',
    howToUse: 'Drag cards freely in any direction (including negative coordinates), hover card edges to drag connection lines, and click Detach, Dock, or Collapse (−) in the Properties header.',
    keywords: 'graph infinite drag lines live port dot connect zoom wheel node edge detach dock collapse properties',
  },

  // Typeset & Cover
  {
    id: 'ctrl-typeset-controls',
    name: 'Book Interior Trim, Font, TOC, Page Numbers & Clean Print PDF',
    category: 'Typeset & Cover',
    controlType: 'Slider',
    location: 'Typeset -> Interior sidebar',
    summary: 'Adjusts book trim size (5x8, 5.5x8.5, 6x9, A5, Royal, Letter), typeface, Body Size (pt), Line Spacing, Table of Contents, Page Numbers, and Pen Name / Title headers.',
    howToUse: 'Toggle levers cleanly without losing scroll position, then click Print PDF for exact trim-sized book sheets with zero browser timestamps or URLs.',
    keywords: 'typeset interior trim royal letter toc table of contents page numbers print pdf header pen name slider lever',
  },
  {
    id: 'ctrl-cover-studio',
    name: 'Cover Studio Views (Front, Back, Spine, Full Wrap, Flaps) & Graphic Layer Sliders',
    category: 'Typeset & Cover',
    controlType: 'Slider',
    location: 'Typeset -> Cover Studio',
    summary: 'Designs front cover, back blurb + ISBN barcode lever, vertical spine, full wrap, and dust jacket flaps with SVG/PNG vector shapes, layer handles, and Scale / Rotation / Opacity controls.',
    howToUse: 'Drop SVG artwork or transparent PNGs onto any cover face, add built-in ornaments or vector shapes, resize via handles, and export Front PNG, Full Wrap PNG, or Print PDF.',
    keywords: 'cover back spine full wrap dust jacket flaps svg png ornament scale rotation opacity slider barcode lever',
  },

  // Settings & Sync
  {
    id: 'ctrl-settings-fonts',
    name: 'Custom Device Fonts, System Font Picker & Extension Font Packs',
    category: 'Settings & Sync',
    controlType: 'Button',
    location: 'Settings -> Typefaces & Fonts',
    summary: 'Installs local .ttf, .otf, .woff, or .woff2 files, queries OS system fonts where permitted, or activates extension font packs.',
    howToUse: 'Drop a font file into the dashed dropzone or click Choose Device Font, then click Use in Draft or Use in Book Typeset on its specimen card.',
    keywords: 'fonts ttf otf woff woff2 upload custom device system font specimen',
  },
  {
    id: 'ctrl-settings-sliders-levers',
    name: 'Draft Font Size, Line Height, Sheet Width & Auto-Save Sliders + Density/Tour Levers',
    category: 'Settings & Sync',
    controlType: 'Slider',
    location: 'Settings -> Workspace & Editor',
    summary: 'Live-updates draft sheet typography (13–28px size, 1.3–2.2 line height, 540–980px width), auto-save interval (150–2000ms), UI density, motion mode, and first-visit tour toggle.',
    howToUse: 'Drag sliders or tap Arrow keys to preview live numeric feedback immediately; flip the Developer Mode or Guided Tour levers on/off anytime.',
    keywords: 'settings editor font size line height sheet width auto save slider density lever tour',
  },
  {
    id: 'ctrl-settings-migration',
    name: 'Publishing Metadata & DOCX / HTML / RTF Importer',
    category: 'Settings & Sync',
    controlType: 'Button',
    location: 'Settings -> Publishing & Migration',
    summary: 'Sets Imprint, ISBN, Edition, Editorial Stage, exports Editorial Handoff sheets (.md), and imports .docx, Web HTML (.html), .rtf, .md, and .txt.',
    howToUse: 'Select a manuscript exported as .docx or .html; headings split automatically into chapters.',
    keywords: 'publishing imprint isbn edition stage docx html rtf migrate handoff import',
  },
  {
    id: 'ctrl-settings-dev',
    name: 'Developer Mode Lever & Build Provenance Verifier',
    category: 'Settings & Sync',
    controlType: 'Lever',
    location: 'Settings -> Developer Tools',
    summary: 'Toggles developer diagnostics mode, displays local workspace telemetry counts, downloads diagnostic JSON, and confirms build publisher origin (jhonrey.com).',
    howToUse: 'Flip the Developer Mode lever to activate diagnostic attributes and export sanitized state summaries without internet requests.',
    keywords: 'developer mode lever provenance diagnostics audit json jhonrey.com',
  },
];
