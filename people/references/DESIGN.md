---
name: Federal Intelligence Interface
colors:
  surface: '#f8f9fa'
  surface-dim: '#d9dadb'
  surface-bright: '#f8f9fa'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f3f4f5'
  surface-container: '#edeeef'
  surface-container-high: '#e7e8e9'
  surface-container-highest: '#e1e3e4'
  on-surface: '#191c1d'
  on-surface-variant: '#44474f'
  inverse-surface: '#2e3132'
  inverse-on-surface: '#f0f1f2'
  outline: '#747780'
  outline-variant: '#c4c6d0'
  surface-tint: '#465e8f'
  primary: '#000a23'
  on-primary: '#ffffff'
  primary-container: '#00204e'
  on-primary-container: '#7189bc'
  inverse-primary: '#aec6fe'
  secondary: '#735c00'
  on-secondary: '#ffffff'
  secondary-container: '#fed65b'
  on-secondary-container: '#745c00'
  tertiary: '#220001'
  on-tertiary: '#ffffff'
  tertiary-container: '#4d0004'
  on-tertiary-container: '#f64b45'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#d8e2ff'
  primary-fixed-dim: '#aec6fe'
  on-primary-fixed: '#001a42'
  on-primary-fixed-variant: '#2e4675'
  secondary-fixed: '#ffe088'
  secondary-fixed-dim: '#e9c349'
  on-secondary-fixed: '#241a00'
  on-secondary-fixed-variant: '#574500'
  tertiary-fixed: '#ffdad6'
  tertiary-fixed-dim: '#ffb4ac'
  on-tertiary-fixed: '#410003'
  on-tertiary-fixed-variant: '#93000e'
  background: '#f8f9fa'
  on-background: '#191c1d'
  surface-variant: '#e1e3e4'
typography:
  headline-lg:
    fontFamily: Public Sans
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 40px
    letterSpacing: -0.02em
  headline-md:
    fontFamily: Public Sans
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
  headline-sm:
    fontFamily: Public Sans
    fontSize: 18px
    fontWeight: '600'
    lineHeight: 24px
  body-lg:
    fontFamily: Public Sans
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-md:
    fontFamily: Public Sans
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  label-technical:
    fontFamily: JetBrains Mono
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
    letterSpacing: 0.05em
  label-metadata:
    fontFamily: JetBrains Mono
    fontSize: 10px
    fontWeight: '400'
    lineHeight: 14px
  headline-lg-mobile:
    fontFamily: Public Sans
    fontSize: 24px
    fontWeight: '700'
    lineHeight: 30px
spacing:
  unit: 4px
  gutter: 24px
  margin-desktop: 48px
  margin-mobile: 16px
  max-width: 1440px
---

## Brand & Style
This design system establishes a high-authority, institutional aesthetic that balances bureaucratic reliability with modern technical precision. It is designed for high-stakes environments where clarity, speed of data ingestion, and perceived security are paramount.

The visual style is **Modern Corporate with a Technical Edge**. It avoids the tropes of "creative" startups in favor of a rigid, grid-based structure that feels official and permanent. The "terminal" influence is maintained through meticulous metadata placement and monospaced accents, but presented on a crisp, light-mode background to ensure accessibility and long-term legibility. The mood is clinical, objective, and secure.

## Colors
The palette is anchored by **Federal Blue**, a deep, saturated navy that communicates intelligence and stability. This is paired with a **Crisp White** background to maintain a high-contrast, professional workspace.

- **Primary:** Federal Blue (#00204E) used for headers, primary actions, and branding.
- **Secondary:** Gold (#D4AF37) derived from the logo, used sparingly for prestige accents, special indicators, or top-tier navigational highlights.
- **Alert/Status:** A bold Red (#C62828) is reserved exclusively for "CONFIDENTIAL" markings, urgent errors, or destructive actions to maintain the gravity of the "Confidential" tag seen in the brand asset.
- **Neutrals:** A range of cool greys provides structure without introducing visual noise.

## Typography
The system utilizes **Public Sans** for all core interface text. Its institutional heritage provides the necessary "government" feel while being highly legible at all sizes. 

To maintain the "high-tech" and "investigative" feel requested, **JetBrains Mono** is used for all metadata, status labels, and technical readouts. This distinction separates primary content (reading/action) from system data (stamps/IDs/technical logs). All technical labels should be set in uppercase with slight letter-spacing to mimic traditional document headers.

## Layout & Spacing
The layout follows a **Fixed Grid** philosophy to mirror the structured nature of official reports and dossiers. 

- **Grid:** A 12-column grid system with a 24px gutter.
- **Density:** High density is encouraged. Information is prioritized over white space to allow investigators to view maximum data without excessive scrolling.
- **Containers:** Content is housed in "Panes" rather than "Cards." These panes are edge-to-edge within their grid columns to emphasize sharp geometry.
- **Breakpoints:** 
  - Desktop: 1024px+ (12 columns)
  - Tablet: 768px - 1023px (8 columns)
  - Mobile: Under 767px (4 columns, margins reduced to 16px).

## Elevation & Depth
In keeping with the professional and sharp geometric requirement, the system avoids soft shadows and "squishy" neomorphism.

- **Flat Layering:** Hierarchy is established through background color shifts (e.g., a Light Grey background with White containers).
- **Low-Contrast Outlines:** Containers use a 1px solid border (#D1D5DB). Active or focused states shift this border to Federal Blue (#00204E).
- **Zero Elevation:** Shadows are not used. Depth is conveyed purely through 1px strokes and tonal shifts in the background. This ensures the UI feels "printed" and objective rather than "app-like."

## Shapes
The design system utilizes **Sharp (0px)** roundedness. Every button, input field, and container is perfectly rectangular. This choice reinforces the authoritative, rigid, and technical nature of the system. There are no exceptions for "pill" shapes; even primary action buttons remain strictly rectangular to maintain the "Secure Terminal" aesthetic.

## Components
- **Buttons:** Rectangular, no radius. Primary buttons are Federal Blue with White text. Secondary buttons are 1px Blue outlines. 
- **Confidential Badge:** A distinct component using a Red (#C62828) background with White, bold, all-caps Public Sans text, mimicking the "CONFIDENTIAL" stamp in the brand asset.
- **Input Fields:** 1px neutral borders that turn Federal Blue on focus. Labels must be accompanied by a small technical ID in JetBrains Mono.
- **Data Tables:** High-density, no vertical borders, subtle horizontal 1px strokes. Header rows should have a light grey background with monospaced labels.
- **Status Indicators:** Use geometric icons (squares or diamonds) rather than circles to maintain the sharp aesthetic.
- **Technical Headers:** Every section should be prefaced with a "Technical Metadata" line (e.g., `REF_ID: 882-ARC // DATE: 2023-10-27`) in JetBrains Mono 10px.