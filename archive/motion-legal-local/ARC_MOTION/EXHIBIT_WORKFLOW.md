# Exhibit workflow

1. Intake: create an exhibit from an uploaded discovery document, a Picture
   Center image, or metadata only. Originals are never altered.
2. Describe: title, description, Bates, date, source person, authentication
   notes, chain-of-custody notes, attorney-only notes (never exported).
3. Number: numeric, alphabetic, Defendant's Exhibit A, Motion Exhibit 1, or a
   custom label. Labels derive from the numbering fields, so renumbering a
   motion's exhibits rewrites every textual reference in the motion sections
   automatically (tested).
4. Package: the exhibit packet PDF generates an exhibit index, a cover page
   per exhibit (caption, designation, description, source, date, Bates,
   confidentiality notice, attorney block), and embeds JPG/PNG exhibits.
   Non-image exhibit files ship inside the filing ZIP alongside the packet.
5. Status: proposed, admitted, excluded, withdrawn; confidential flag adds
   the protective-order notice to the cover page.

Picture Center v1 supports direct image intake (JPG/JPEG/PNG/WEBP/TIFF) with
hashes and full source metadata. PDF page rendering / region extraction and
in-app annotation/redaction are roadmap items; see Known Limitations.
External web images are disabled.
