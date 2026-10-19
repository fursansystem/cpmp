# Design Guidelines: ProjectManager Pro Contracting

## Design Approach

**System Selected:** Linear-inspired productivity design with Material Design data components

**Rationale:** Project management for contractors requires clarity, efficiency, and professional credibility. We'll adopt Linear's clean typography and spacious layouts combined with Material Design's robust data tables and cards for information density.

**Key Principles:**
- Information hierarchy over decoration
- Scannable data displays
- Professional contractor industry aesthetic
- Minimal cognitive load for busy project managers

## Typography System

**Font Families:**
- Primary: Inter (via Google Fonts) - UI elements, tables, forms
- Display: Plus Jakarta Sans (via Google Fonts) - Page headers, project titles

**Type Scale:**
- Page Headers: text-3xl font-bold (Plus Jakarta Sans)
- Section Headers: text-xl font-semibold (Plus Jakarta Sans)
- Card Titles: text-lg font-medium (Inter)
- Body Text: text-base font-normal (Inter)
- Table Data: text-sm font-normal (Inter)
- Labels: text-xs font-medium uppercase tracking-wide (Inter)
- Metadata: text-xs text-opacity-60 (Inter)

## Layout System

**Spacing Primitives:** Use Tailwind units of 2, 4, 6, 8, and 12 consistently
- Component padding: p-4 or p-6
- Section spacing: space-y-6 or space-y-8
- Card gaps: gap-4 or gap-6
- Form field spacing: space-y-4

**Grid Structure:**
- Main dashboard: 3-column grid (lg:grid-cols-3) for metric cards
- Project list: 2-column grid (lg:grid-cols-2) for project cards
- Team view: 4-column grid (lg:grid-cols-4) for team member cards
- Single column on mobile (always)

**Container Strategy:**
- Max-width: max-w-7xl mx-auto
- Page padding: px-6 lg:px-8
- Section padding: py-8

## Component Library

### Navigation
**Sidebar Navigation:**
- Fixed left sidebar (w-64) with company logo at top
- Navigation items with Heroicons icons (outline style)
- Active state with subtle background treatment
- Sections: Dashboard, Projects, Tasks, Clients, Team, Documents, Budget

**Top Bar:**
- Search bar (max-w-md) with magnifying glass icon
- Notification bell icon
- User profile dropdown (right-aligned)
- Breadcrumb navigation for deep pages

### Dashboard Components

**Metric Cards:**
- Rounded corners (rounded-lg)
- Shadow (shadow-sm)
- Padding p-6
- Large numbers (text-3xl font-bold)
- Label below (text-sm with opacity)
- Icon in top-right corner (Heroicons)

**Project Cards:**
- Rounded-lg with shadow-md
- Header with project name + status badge
- Progress bar showing completion percentage
- Metadata row: Client name, Budget, Timeline
- Action buttons footer (View Details, Edit)

**Status Badges:**
- Small rounded pills (rounded-full px-3 py-1 text-xs font-medium)
- Types: Active, Pending, Completed, Overdue, On Hold

### Data Display

**Tables:**
- Full-width with rounded container
- Header row with medium weight text
- Alternating row backgrounds for scanability
- Right-aligned action column with icon buttons
- Sticky header on scroll
- Columns: Project Name, Client, Status, Budget, Timeline, Progress, Actions

**Timeline View:**
- Horizontal scrollable timeline with date markers
- Project blocks showing duration as bars
- Milestone diamonds along timeline
- Drag-and-drop visual affordance

### Forms

**Input Fields:**
- Rounded borders (rounded-md)
- Clear labels above inputs (text-sm font-medium)
- Placeholder text with reduced opacity
- Helper text below (text-xs)
- Error states with border treatment and error text

**Form Layouts:**
- Two-column grid for related fields (lg:grid-cols-2 gap-6)
- Full-width for textarea and complex inputs
- Action buttons right-aligned at bottom

**Buttons:**
- Primary: Bold call-to-action (rounded-md px-4 py-2 font-medium)
- Secondary: Outline style
- Tertiary: Text-only with hover underline
- Icon buttons: Square (w-10 h-10) with centered icon

### Specialized Components

**File Upload Zone:**
- Dashed border (border-2 border-dashed rounded-lg)
- Large centered icon (Heroicons: document-arrow-up)
- Drop instruction text
- File type/size guidance

**Budget Tracker:**
- Horizontal bar showing spent vs. estimated
- Numerical breakdown below
- Warning state when approaching budget

**Document List:**
- List items with file icon, name, size, upload date
- Download and delete actions
- Group by category (Contracts, Plans, Invoices, Photos)

## Icons

**Library:** Heroicons (via CDN)
- Navigation: 24px outline icons
- Cards/buttons: 20px solid icons
- Table actions: 16px outline icons

## Images

**No Hero Images:** This is a dashboard application - users log directly into their project workspace

**Profile Photos:**
- Team member avatars: rounded-full (w-10 h-10)
- Client logos: rounded-md (w-16 h-16)

**Document Thumbnails:**
- PDF/image previews in document list
- Placeholder for non-previewable files

## Animations

**Minimal Motion:**
- Hover state transitions only (transition-colors duration-200)
- No scroll animations
- No loading spinners beyond simple circular indicator