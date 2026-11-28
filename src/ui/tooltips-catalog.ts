import type { TooltipSpec } from './tooltip';

export const TOOLTIP_CATALOG = {
  toggleBinder: {
    title: 'Manuscript Binder',
    short: 'Show or hide chapters and scenes list.',
    details: 'Toggles the left navigation tree of Parts, Chapters, and Scenes. Adapts into a slide-over drawer on compact screens.',
  },
  bookTitle: {
    title: 'Active Book Title',
    short: 'Click to rename the active book.',
    details: 'Updates the title across the binder, Library shelf, live typeset front matter, Book Cover Studio, and EPUB/Markdown exports.',
  },
  saveStatus: {
    title: 'Local Persistence',
    short: 'Shows when edits finish saving locally.',
    details: 'Edits save automatically to your browser store or desktop app directory. No cloud account is needed.',
  },
  navEditor: {
    title: 'Manuscript Workspace',
    short: 'Write prose, proofread, compare diffs, and review notes.',
    details: 'Main drafting studio with Draft, Proofread, Split Reference, and Revision Diff modes, paper themes, and typewriter centering.',
  },
  navCorkboard: {
    title: 'Corkboard Cards',
    short: 'Arrange scenes as visual index cards.',
    details: 'Shows scene synopses, POV tags, word progress bars, and lets you drag scene cards between chapters.',
  },
  navOutline: {
    title: 'Outline Ledger',
    short: 'Spreadsheet overview of pacing and targets.',
    details: 'Filter scenes by status, POV, timeline, or location in a tabular view with word count completion percentages.',
  },
  navBible: {
    title: 'Story Bible',
    short: 'Manage characters, locations, lore, and custom categories.',
    details: 'Tracks worldbuilding entries, reference images, custom fields, and automatic scene appearance backlinks.',
  },
  navGraph: {
    title: 'Story Graph',
    short: 'Interactive canvas linking plots, characters, and scenes.',
    details: 'Drag nodes, connect typed relationship lines, interchange node categories, or run auto-layout.',
  },
  navTypeset: {
    title: 'Typeset & Cover Studio',
    short: 'Format book interior, design covers, and seal editions.',
    details: 'Preview book pages at print trim sizes, customize front/back covers, verify Author Key readiness, and export EPUB 3 or PDF.',
  },
  library: {
    title: 'Library & Author Identity',
    short: 'Switch books and set Pen Name, Signature, and Author Key.',
    details: 'Manage multiple books in one workspace, draw or type a signature, and seal manuscripts with a per-book ECDSA Author Key.',
  },
  collaborate: {
    title: 'Collaborate Offline',
    short: 'Credits, proofreader notes, Wi-Fi LAN, and Bluetooth sync.',
    details: 'Add co-authors and proofreaders, pair with nearby laptops over the same Wi-Fi PIN or Bluetooth transfer, and merge edits with snapshot safety.',
  },
  openFile: {
    title: 'Open File',
    short: 'Open .qv, .qv* or .qvext files.',
    shortcut: 'Ctrl+O',
    details: 'Decodes protected QVBX Quillvibe files directly into the matching workspace view. Import legacy .quillvibe or .bookvibe files from Settings -> Migration.',
  },
  saveDefault: {
    title: 'Export Using Selected Format',
    short: 'Saves or exports using the active dropdown format.',
    shortcut: 'Ctrl+S',
    details: 'Exports immediately in the format chosen beside this button (.qv, .pdf, .epub, .md, .html, .txt, or .qv*).',
  },
  defaultFormatSelect: {
    title: 'Default Export Format',
    short: 'Choose which format Save/Export outputs by default.',
    details: 'Persists your preferred export extension across sessions. .qv preserves everything; .pdf builds trim-sized pages; .epub builds an eBook with cover.',
  },
  extensionsManager: {
    title: 'Extensions & Formats',
    short: 'Manage integrated toolkits, external plugins, and file formats.',
    details: 'Enable or run built-in proofing/cleanup/font extensions, inspect permissions before installing external .qvext files, and audit data reads.',
    tips: [
      'External plugins require explicit permission review before install.',
      'Extensions cannot access the internet, filesystem, or permanent author keys.',
    ],
  },
  settingsBtn: {
    title: 'Settings, Layouts & Themes',
    short: 'Workspace layouts (Focused / Editorial / Full Studio), themes, fonts & imports.',
    details: 'Switch between Focused, Editorial, and Full Studio layouts, change Ivory/Parchment/Obsidian themes, install custom fonts, or import .docx/.html/.md/.bookvibe files.',
  },
  tierSwitch: {
    title: 'Workspace Layout',
    short: 'Switch between Focused, Editorial, and Full Studio workspace layouts.',
    details: 'Focused keeps a distraction-free drafting page; Editorial adds Corkboard, Outline, Proofread & Typeset; Full Studio opens Cover Studio, Story Bible & Graph.',
  },
  themeSwitch: {
    title: 'Application Theme',
    short: 'Cycle between Ivory Light, Parchment, and Obsidian Dark.',
  },
  courseBtn: {
    title: 'Book Writing Course',
    short: 'Complete hands-on course to master writing and publishing in Quillvibe.',
  },
  helpBtn: {
    title: 'Help, Course & Manual',
    short: 'Open the full book course, icon directory, controls search, and shortcuts.',
    shortcut: 'F1',
  },
  toggleInspector: {
    title: 'Scene Inspector',
    short: 'Show or hide scene metadata, snapshots, and proof notes across any workspace view.',
    details: 'Displays POV, location, synopsis, detected Story Bible mentions, snapshots, and proofreader notes.',
  },
  modeDraft: {
    title: 'Draft Mode',
    short: 'Distraction-free single paper sheet editor.',
    details: 'Write prose on Obsidian, Parchment, or Ivory paper with Markdown shortcuts and live word counts.',
  },
  modeProofread: {
    title: 'Proofread Markup Mode',
    short: 'Cross out words, insert carets, transpose, stet, and comment.',
    details: 'Interactive editorial markup view supporting standard publishing marks. Click Accept, Stet, or Reject on any mark with automatic snapshot backup.',
  },
  modeSplit: {
    title: 'Split Reference View',
    short: 'Read a character, location, or scene beside your draft.',
    details: 'Opens a side pane showing any Story Bible entry or scene next to the active editor.',
  },
  modeDiff: {
    title: 'Revision Diff',
    short: 'Compare current scene word-for-word against a snapshot.',
    details: 'Highlights added words in green and removed words in red strikethrough, with 1-click snapshot restore.',
  },
  bold: {
    title: 'Bold Emphasis',
    short: 'Wrap selection in **bold** Markdown.',
    shortcut: 'Ctrl+B',
  },
  italic: {
    title: 'Italic Emphasis',
    short: 'Wrap selection in *italic* Markdown.',
    shortcut: 'Ctrl+I',
  },
  heading: {
    title: 'Section Heading',
    short: 'Prefix current line with ## subheading.',
  },
  quote: {
    title: 'Epigraph / Blockquote',
    short: 'Format current paragraph as an indented quote.',
  },
  sceneBreak: {
    title: 'Scene Break',
    short: 'Insert centered * * * dinkus separator.',
  },
  splitScene: {
    title: 'Split Scene at Cursor',
    short: 'Divide active scene into two scenes at cursor.',
    details: 'Creates a new scene immediately after the current one starting from the cursor offset.',
  },
  typewriter: {
    title: 'Typewriter Scrolling',
    short: 'Add vertical breathing room around typing line.',
  },
  zen: {
    title: 'Zen Focus Mode',
    short: 'Hide sidebars to focus solely on the page.',
    shortcut: 'Ctrl+Shift+F',
  },
  snapshot: {
    title: 'Capture Revision Snapshot',
    short: 'Save an immutable checkpoint of this scene.',
    shortcut: 'Ctrl+S',
    details: 'Stores a timestamped copy of scene prose inside the project for word diffing or restore.',
  },
  typesetInterior: {
    title: 'Book Interior Typesetting',
    short: 'Trim size, serif typography, drop caps, and print preview.',
  },
  typesetCover: {
    title: 'Book Cover Studio',
    short: 'Front, spine, and back wrap designer with drag-and-drop.',
    details: 'Drop cover images directly onto the cover, drag title/author/signature layers, and export PNG or EPUB 3 with cover embedded.',
  },
  typesetPublish: {
    title: 'Publish & Author Seal',
    short: 'Author Key signing and ready-to-publish checklist.',
    details: 'Generate per-book cryptographic Author Keys, verify resolved proofread marks, and sign release bundles.',
  },
  collabCredits: {
    title: 'Co-Authors & Proofreaders',
    short: 'Manage collaborator roles and credit lines.',
  },
  collabWifi: {
    title: 'Same-Wi-Fi LAN Sync',
    short: 'Share or pull revisions offline over local Wi-Fi.',
    details: 'Starts a temporary HTTP sync host bound to local private Wi-Fi IPv4 and protected by a 6-digit PIN.',
  },
  collabBluetooth: {
    title: 'Bluetooth & Nearby Transfer',
    short: 'Export and merge via OS Bluetooth or file share.',
  },
  collabServer: {
    title: 'Enterprise / Custom Website Sync',
    short: 'Connect directly to your own HTTPS sync server or website endpoint.',
  },
  newWindowBtn: {
    title: 'Open New Book Window',
    short: 'Launch an independent Quillvibe window to work on multiple books side by side.',
  },
  immersiveBtn: {
    title: 'Immersive Fullscreen Mode',
    short: 'Enter distraction-free full-screen focus with optional live clock, timer, and alarm.',
    shortcut: 'F11',
  },
  alarmBtn: {
    title: 'Writing Alarm Clock & Ringtones',
    short: 'Set a scheduled time or countdown alarm with gentle synthesized ringtones.',
  },
  extIntegrated: {
    title: 'Integrated Extensions',
    short: 'Built-in offline proofing, cleanup, metrics, and presets.',
  },
  extExternal: {
    title: 'External Extensions (.qvext)',
    short: 'Install community .qvext bundles with permission consent.',
    details: 'Inspect exact permissions requested, toggle individual scopes on/off, and audit every data read.',
  },
  extFormats: {
    title: 'Official Formats & Registration',
    short: 'Inspect protected Quillvibe extensions (.qv, .qv*).',
  },
} satisfies Record<string, TooltipSpec>;
