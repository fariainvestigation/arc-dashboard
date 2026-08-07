ARC Lead Development Module ONLY

Drop these files into the ARC_v11_4 app root, preserving folders:
- 21_Investigation_Development.html
- 09_Intelligence_Board.html
- arc_investigation_development.css
- arc_investigation_development.js
- arc_provider_client.js
- api/investigation-workspace.js

Dashboard integration needed in index.html:
1. Add this module entry near the Analysis modules:
   ["Lead Development", "21_Investigation_Development.html"],

2. Route the Analysis workflow stage to it:
   if (stage === "analysis") selectTarget("21_Investigation_Development.html");

Cloudflare Worker integration:
- arc-sync-backend/worker.with-investigation-route.js is the Worker file with the D1 investigation workspace route included.
- Use it as a reference or replace the existing Worker after reviewing any newer Worker changes.

Added Stage 10 report package builder:
- 22_Report_Package_Builder.html
- arc_report_package_builder.css
- arc_report_package_builder.js

The builder creates one master report and three synchronized outputs:
1. Formal PDF through browser Print / Save PDF
2. Single-file interactive attorney HTML
3. Offline client dashboard ZIP with report data, print HTML, manifest, and SHA-256 checksums

Dashboard integration entry:
  ["Report Builder and Finalization", "22_Report_Package_Builder.html"],

The Lead Development Workspace now includes an Open Report Builder button.
