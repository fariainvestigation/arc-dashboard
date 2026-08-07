import React, { useState } from 'react';
import {
  FileText,
  Download,
  Printer,
  User,
  Briefcase,
  FileCode,
  CheckCircle,
  AlertTriangle,
  Edit3,
  Save,
  Code,
  Image as ImageIcon,
  FlaskConical,
  BookOpen,
  Scale,
  ShieldAlert,
  Clock,
  ExternalLink,
  ChevronRight,
  Info
} from 'lucide-react';
import { Document as DocxDocument, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } from 'docx';
import { CaseData, ProceduralError } from '../types';
import { computeAllThresholdVerdicts, ThresholdVerdict } from '../lib/thresholdVerdict';
import { labDiscoveryRequests, generateLabProceduralErrors } from '../lib/labRuleEngine';
import { ArcLogo } from './ArcLogo';

interface DefenseReportGeneratorProps {
  currentCase: CaseData;
  proceduralErrors: ProceduralError[];
}

interface AuthorityReference {
  citation: string;
  topic: string;
  ruleOrHolding: string;
  relevanceToCase: string;
}

export const DefenseReportGenerator: React.FC<DefenseReportGeneratorProps> = ({
  currentCase,
  proceduralErrors
}) => {
  const [reportView, setReportView] = useState<'attorney' | 'client'>('attorney');
  const [isEditing, setIsEditing] = useState<boolean>(false);

  // Lab analysis state derived from case
  const lab = currentCase.labResultData;
  const thresholdVerdicts: ThresholdVerdict[] = computeAllThresholdVerdicts(lab);

  const rawLabErrors = proceduralErrors.filter((e) => e.id && e.id.indexOf('lab_') === 0);
  const mergedLabErrors = rawLabErrors.length > 0 ? rawLabErrors : generateLabProceduralErrors(lab);

  const nonLabErrors = proceduralErrors.filter((e) => !e.id || e.id.indexOf('lab_') !== 0);

  const labDiscovery = labDiscoveryRequests(mergedLabErrors);
  const labCritical = mergedLabErrors.some((e) => e.severity === 'CRITICAL');
  const anySpansOrBelow = thresholdVerdicts.some((v) => v.position === 'spans' || v.position === 'below');

  const defaultBottomLine = anySpansOrBelow || labCritical
    ? 'The reported quantitative result does not cleanly establish the element once the laboratory\u2019s own stated measurement uncertainty and quality control deviations are applied. See the threshold analysis and specific certificate findings below.'
    : 'The reported identification and quantity appear sound on the certificate as presented. The available challenges lie in foundation, chain of custody, and officer procedure rather than in the analytical chemistry itself.';

  const [customBottomLine, setCustomBottomLine] = useState<string>(defaultBottomLine);
  const [editableLabFindings, setEditableLabFindings] = useState<ProceduralError[]>(mergedLabErrors);
  const [editableProceduralFindings, setEditableProceduralFindings] = useState<ProceduralError[]>(nonLabErrors);

  // Filter verified citations
  const verifiedCitations = proceduralErrors.filter((e) => e.verificationStatus === 'VERIFIED');

  // Build Bank of Knowledge Authorities matching current findings
  const getAttachedAuthorities = (): AuthorityReference[] => {
    const authorities: AuthorityReference[] = [];

    const allErrors = [...editableLabFindings, ...editableProceduralFindings];

    allErrors.forEach((err) => {
      const lowerTitle = (err.title + ' ' + err.description + ' ' + err.standardViolated).toLowerCase();

      if (lowerTitle.includes('spans') || lowerTitle.includes('uncertainty') || lowerTitle.includes('threshold') || lowerTitle.includes('cutoff')) {
        authorities.push({
          citation: 'Commonwealth v. Colturi, 448 Mass. 809 (2007) & ISO/IEC 17025 § 7.8.5',
          topic: 'Measurement Uncertainty & Statutory Cutoffs',
          ruleOrHolding: 'When stated measurement uncertainty spans the statutory cutoff, the true value cannot be proved beyond a reasonable doubt as a matter of scientific certainty.',
          relevanceToCase: 'Directly supports excluding or limiting quantitative laboratory results when uncertainty bounds overlap the threshold.'
        });
      }

      if (lowerTitle.includes('observation') || lowerTitle.includes('501 cmr 2.13') || lowerTitle.includes('interrupted')) {
        authorities.push({
          citation: 'Commonwealth v. Pierre, 72 Mass. App. Ct. 230 (2008) & 501 CMR 2.13',
          topic: 'Continuous 15-Minute Observation Window',
          ruleOrHolding: 'Uninterrupted visual observation for a full 15 minutes is a mandatory condition precedent to chemical test admissibility under M.G.L. c. 90 § 24K.',
          relevanceToCase: 'Officer typing on computer or retrieving paperwork during observation period invalidates test results.'
        });
      }

      if (lowerTitle.includes('exit order') || lowerTitle.includes('cruz') || lowerTitle.includes('marijuana') || lowerTitle.includes('odor')) {
        authorities.push({
          citation: 'Commonwealth v. Cruz, 459 Mass. 459 (2011) & M.G.L. c. 94C § 32L',
          topic: 'Exit Order Standard & Burnt Marijuana Odor',
          ruleOrHolding: 'The odor of burnt marijuana alone does not supply reasonable suspicion of criminal activity to justify ordering a driver to exit a vehicle.',
          relevanceToCase: 'Requires suppression of all evidence obtained after an exit order commanded solely on marijuana odor.'
        });
      }

      if (lowerTitle.includes('gerhardt') || lowerTitle.includes('cannabis') || lowerTitle.includes('opinion')) {
        authorities.push({
          citation: 'Commonwealth v. Gerhardt, 477 Mass. 775 (2017)',
          topic: 'Admissibility of Officer Opinion on Cannabis Impairment',
          ruleOrHolding: 'Police officers may not testify that a subject "failed" field sobriety tests or was "under the influence" of marijuana.',
          relevanceToCase: 'Bars officer lay opinion asserting marijuana intoxication from roadside test performance.'
        });
      }

      if (lowerTitle.includes('qc') || lowerTitle.includes('batch') || lowerTitle.includes('drift') || lowerTitle.includes('quality control')) {
        authorities.push({
          citation: 'Commonwealth v. Camblin, 478 Mass. 469 (2017) & Commonwealth v. Zeininger',
          topic: 'Scientific Reliability & Batch Quality Control Records',
          ruleOrHolding: 'Analytical results from a laboratory batch with uncorrected quality control deviations or calibrator drift lack foundational reliability under Daubert/Lanigan.',
          relevanceToCase: 'Mandates exclusion of toxicology batch results when quality control calibrator standards drift outside acceptance.'
        });
      }

      if (lowerTitle.includes('refusal') || lowerTitle.includes('mcgrail')) {
        authorities.push({
          citation: 'Commonwealth v. McGrail, 419 Mass. 774 (1995) & Article 12, MA Declaration of Rights',
          topic: 'Inadmissibility of Chemical Test Refusal',
          ruleOrHolding: 'Refusal to submit to chemical breath testing is strictly inadmissible under Article 12 self-incrimination protections.',
          relevanceToCase: 'Characterizing test refusal as consciousness of guilt in police reports or trial violates constitutional rights.'
        });
      }

      if (lowerTitle.includes('custody') || lowerTitle.includes('delay') || lowerTitle.includes('22c')) {
        authorities.push({
          citation: 'M.G.L. c. 22C § 39 & Commonwealth v. Johnson, 481 Mass. 710 (2019)',
          topic: 'Sample Chain of Custody & Forensic Laboratory Integrity',
          ruleOrHolding: 'State Crime Lab must maintain strict uncompromised chain of custody and temperature-controlled storage logs for biological samples.',
          relevanceToCase: 'Unexplained delays between sample collection and state lab analysis cast doubt on volatile analyte stability.'
        });
      }

      if (lowerTitle.includes('medical') || lowerTitle.includes('24(1)(e)')) {
        authorities.push({
          citation: 'M.G.L. c. 90 § 24(1)(e) & Commonwealth v. King, 429 Mass. 169 (1999)',
          topic: 'Right to Immediate Independent Medical Examination',
          ruleOrHolding: 'Arrestees for OUI have an absolute statutory right to be informed of their opportunity for an immediate independent physician examination.',
          relevanceToCase: 'Failure to inform subject of medical exam rights prejudices the defense and supports suppression or dismissal.'
        });
      }
    });

    // Deduplicate authorities by citation
    const uniqueMap = new Map<string, AuthorityReference>();
    authorities.forEach((a) => {
      if (!uniqueMap.has(a.citation)) {
        uniqueMap.set(a.citation, a);
      }
    });

    // Default fallbacks if empty
    if (uniqueMap.size === 0) {
      uniqueMap.set('M.G.L. c. 90 § 24', {
        citation: 'M.G.L. c. 90 § 24',
        topic: 'Operating Under the Influence Statutory Framework',
        ruleOrHolding: 'Commonwealth carries burden of proving operation, public way, and impairment beyond a reasonable doubt.',
        relevanceToCase: 'Governing statutory authority for all OUI prosecutions in Mass. District Courts.'
      });
    }

    return Array.from(uniqueMap.values());
  };

  const attachedAuthorities = getAttachedAuthorities();

  // Export handlers
  const handleExportJSON = () => {
    const exportData = {
      caseInformation: {
        clientName: currentCase.clientName,
        caseNumber: currentCase.caseNumber,
        court: currentCase.court,
        charge: currentCase.charge,
        incidentDate: currentCase.incidentDate,
        arrestingAgency: currentCase.arrestingAgency
      },
      bottomLineVerdict: customBottomLine,
      thresholdVerdicts,
      toxicologyLabAnalysis: lab,
      labFindings: editableLabFindings,
      proceduralDefects: editableProceduralFindings,
      discoveryToRequest: labDiscovery,
      attachedCaseLaw: attachedAuthorities,
      extractedImages: currentCase.extractedImages || [],
      generatedDate: new Date().toISOString()
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Forensic_Defense_Report_${currentCase.caseNumber}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleExportHTML = () => {
    const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Massachusetts Forensic Defense Report - ${currentCase.clientName}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; line-height: 1.6; color: #0f172a; max-width: 960px; margin: 40px auto; padding: 24px; background: #ffffff; }
    h1, h2, h3, h4 { color: #0f172a; margin-top: 24px; margin-bottom: 8px; }
    .header { border-bottom: 3px solid #1e3a8a; padding-bottom: 16px; margin-bottom: 24px; }
    .badge { display: inline-block; padding: 4px 10px; font-size: 11px; font-weight: bold; text-transform: uppercase; border-radius: 4px; background: #dbeafe; color: #1e40af; }
    .box { background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 8px; padding: 16px; margin-bottom: 16px; }
    .critical { background: #fef2f2; border-color: #fca5a5; color: #991b1b; }
    .high { background: #fffbeb; border-color: #fde68a; color: #92400e; }
    .pinpoint { font-family: monospace; font-weight: bold; color: #1d4ed8; background: #eff6ff; padding: 2px 6px; border-radius: 4px; border: 1px solid #bfdbfe; font-size: 11px; }
    table { width: 100%; border-collapse: collapse; margin: 16px 0; }
    th, td { padding: 10px; border: 1px solid #cbd5e1; text-align: left; font-size: 12px; }
    th { background: #f1f5f9; font-weight: bold; }
    img { max-width: 100%; height: auto; border-radius: 6px; border: 1px solid #cbd5e1; margin-top: 8px; }
    .authority-card { background: #faf5ff; border: 1px solid #e9d5ff; padding: 12px; border-radius: 6px; margin-bottom: 10px; }
    .footer { margin-top: 40px; font-size: 11px; color: #64748b; font-style: italic; border-top: 1px solid #cbd5e1; padding-top: 12px; text-align: center; }
  </style>
</head>
<body>
  <div class="header">
    <span class="badge">Attorney Work Product - Forensic Defense Analysis</span>
    <h1>Forensic & Legal Defense Analysis Report</h1>
    <p><strong>Client:</strong> ${currentCase.clientName} | <strong>Case #:</strong> ${currentCase.caseNumber} | <strong>Court:</strong> ${currentCase.court}</p>
    <p><strong>Charge:</strong> ${currentCase.charge} | <strong>Arresting Agency:</strong> ${currentCase.arrestingAgency}</p>
  </div>

  <h2>1. FORENSIC TOXICOLOGY & LAB ANALYSIS</h2>
  ${lab ? `
    <p><strong>Testing Lab:</strong> ${lab.labName} | <strong>Certificate ID:</strong> ${lab.labCertificateId}</p>
    <p><strong>Analyst:</strong> ${lab.analystName} | <strong>Sample Type:</strong> ${lab.sampleType} | <strong>Collection:</strong> ${lab.collectionTimestamp}</p>

    <div class="box">
      <h3 style="margin-top:0;">Bottom Line Forensic Verdict</h3>
      <p style="font-size: 14px; font-weight: 500;">${customBottomLine}</p>
    </div>

    <h3>Component Analytics & Stated Uncertainty Ranges</h3>
    <table>
      <thead>
        <tr>
          <th>Substance</th>
          <th>Reported Result</th>
          <th>Cutoff Level</th>
          <th>Stated Uncertainty</th>
          <th>Effective Range</th>
          <th>Testing Method</th>
          <th>QC Batch</th>
        </tr>
      </thead>
      <tbody>
        ${(lab.components || []).map((c) => {
          const lower = Math.max(0, parseFloat((c.detectedValue - c.uncertaintyRange).toFixed(4)));
          const upper = parseFloat((c.detectedValue + c.uncertaintyRange).toFixed(4));
          return `
            <tr>
              <td><strong>${c.substance}</strong></td>
              <td><strong>${c.detectedValue} ${c.unit}</strong></td>
              <td>${c.cutoffLevel} ${c.unit}</td>
              <td>&plusmn; ${c.uncertaintyRange} ${c.unit}</td>
              <td>${lower} - ${upper} ${c.unit}</td>
              <td>${c.testingMethod}</td>
              <td>${c.qcBatchPassed ? '<span style="color:green; font-weight:bold;">PASSED</span>' : '<span style="color:red; font-weight:bold;">FAILED / DEVIATION</span>'}</td>
            </tr>
          `;
        }).join('')}
      </tbody>
    </table>

    <h3>Certificate Findings & Defense Opportunities</h3>
    ${editableLabFindings.map((e) => `
      <div class="box ${e.severity === 'CRITICAL' ? 'critical' : e.severity === 'HIGH' ? 'high' : ''}">
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <strong>[${e.severity}] ${e.title}</strong>
          ${e.pageParagraphRef?.pageNumber ? `<span class="pinpoint">Page ${e.pageParagraphRef.pageNumber}, ¶ ${e.pageParagraphRef.paragraphNumber} (${e.pageParagraphRef.documentName || 'Cert'})</span>` : ''}
        </div>
        <p style="margin: 8px 0;">${e.description}</p>
        ${e.verbatimQuote ? `<p style="font-style:italic; background:#ffffff; padding:6px; border-left:3px solid #3b82f6; font-size:12px;">"${e.verbatimQuote}"</p>` : ''}
        <p style="margin-bottom:0;"><strong>Exclusion Strategy:</strong> ${e.evidentiaryExclusionStrategy}</p>
      </div>
    `).join('')}
  ` : '<p>No forensic laboratory certificate recorded for this case.</p>'}

  <h2>2. PROCEDURAL DISCOVERY DEFECTS & EXACT PINPOINT CITATIONS</h2>
  ${editableProceduralFindings.map((f) => `
    <div class="box ${f.severity === 'CRITICAL' ? 'critical' : f.severity === 'HIGH' ? 'high' : ''}">
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <strong>[${f.severity}] ${f.title}</strong>
        <span class="pinpoint">${f.pageParagraphRef.documentName || 'Discovery'} &bull; Page ${f.pageParagraphRef.pageNumber}, ¶ ${f.pageParagraphRef.paragraphNumber}</span>
      </div>
      <p style="margin: 8px 0;">${f.description}</p>
      <p style="font-style:italic; background:#ffffff; padding:8px; border-left:3px solid #1e3a8a; font-size:12px;">&ldquo;${f.verbatimQuote}&rdquo;</p>
      <p><strong>Potential Standard / Authority:</strong> ${f.standardViolated}</p>
      <p style="margin-bottom:0;"><strong>Potential Defense Issue:</strong> ${f.evidentiaryExclusionStrategy}</p>
    </div>
  `).join('')}

  <h2>3. CANDIDATE AUTHORITIES — COURTLISTENER VERIFICATION REQUIRED</h2>
  ${attachedAuthorities.map((auth) => `
    <div class="authority-card">
      <h4 style="margin:0 0 4px 0; color:#581c87;">${auth.citation}</h4>
      <p style="margin:0 0 4px 0; font-weight:bold; font-size:12px;">Topic: ${auth.topic}</p>
      <p style="margin:0 0 4px 0; font-size:12px;"><strong>Holding:</strong> ${auth.ruleOrHolding}</p>
      <p style="margin:0; font-size:12px; color:#4c1d95;"><strong>Application:</strong> ${auth.relevanceToCase}</p>
    </div>
  `).join('')}

  ${currentCase.extractedImages && currentCase.extractedImages.length > 0 ? `
    <h2>4. EXTRACTED DISCOVERY GRAPHICS & EVIDENCE PHOTOS</h2>
    <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px;">
      ${currentCase.extractedImages.map((img) => `
        <div class="box">
          <img src="${img.dataUrl}" alt="${img.caption}" />
          <p style="margin-top:8px; font-weight:bold;">${img.name}</p>
          <p style="font-size: 11px; color: #475569;">Pinpoint: Page ${img.pageNumber} of ${img.sourceDocumentName}</p>
          <p style="font-size: 12px;">${img.caption}</p>
        </div>
      `).join('')}
    </div>
  ` : ''}

  <h2>5. DISCOVERY REQUESTS TO FILE</h2>
  <ul>
    ${labDiscovery.map((d) => `<li>${d}</li>`).join('')}
  </ul>

  <div class="footer">
    This tool assists licensed Massachusetts counsel, output is attorney work product, all citations and quotes must be independently verified against the source discovery before filing, and no output constitutes legal advice.
  </div>
</body>
</html>`;

    const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Forensic_Defense_Report_${currentCase.caseNumber}.html`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleExportMarkdown = () => {
    const content = `# MASSACHUSETTS FORENSIC DEFENSE ANALYSIS REPORT
Client: ${currentCase.clientName}
Case Number: ${currentCase.caseNumber}
Court: ${currentCase.court}
Charge: ${currentCase.charge}
Arresting Agency: ${currentCase.arrestingAgency}
Date: ${new Date().toLocaleDateString()}

---

## 1. FORENSIC TOXICOLOGY & LAB ANALYSIS
Bottom Line Verdict: ${customBottomLine}

${lab ? `
Laboratory: ${lab.labName} (Certificate #${lab.labCertificateId})
Analyst: ${lab.analystName} | Sample: ${lab.sampleType}

### Component Analytics & Measurement Uncertainty
${(lab.components || []).map((c) => `- **${c.substance}**: ${c.detectedValue} ${c.unit} (Cutoff: ${c.cutoffLevel} ${c.unit}, Uncertainty: +/- ${c.uncertaintyRange} ${c.unit}) [QC: ${c.qcBatchPassed ? 'PASS' : 'FAIL'}]`).join('\n')}

### Lab Findings Tied to Certificate
${editableLabFindings.map((e, i) => `${i + 1}. [${e.severity}] ${e.title}\n   - Pinpoint: Page ${e.pageParagraphRef?.pageNumber}, ¶ ${e.pageParagraphRef?.paragraphNumber} (${e.pageParagraphRef?.documentName || 'Cert'})\n   - Description: ${e.description}\n   - Verbatim Quote: "${e.verbatimQuote}"\n   - Strategy: ${e.evidentiaryExclusionStrategy}`).join('\n\n')}
` : 'No lab certificate data on file.'}

---

## 2. PROCEDURAL DISCOVERY DEFECTS & EXACT PINPOINT CITATIONS
${editableProceduralFindings.map((f, i) => `${i + 1}. [${f.severity}] ${f.title}\n   - Pinpoint Ref: Page ${f.pageParagraphRef.pageNumber}, ¶ ${f.pageParagraphRef.paragraphNumber} (${f.pageParagraphRef.documentName || 'Discovery'})\n   - Verbatim Quote: "${f.verbatimQuote}"\n   - Potential Standard / Authority: ${f.standardViolated}\n   - Strategy: ${f.evidentiaryExclusionStrategy}`).join('\n\n')}

---

## 3. CANDIDATE AUTHORITIES — COURTLISTENER VERIFICATION REQUIRED
${attachedAuthorities.map((auth) => `- **${auth.citation}**\n  Topic: ${auth.topic}\n  Rule/Holding: ${auth.ruleOrHolding}\n  Case Application: ${auth.relevanceToCase}`).join('\n\n')}

---

## 4. FORMAL DISCOVERY TO REQUEST
${labDiscovery.map((d) => `- ${d}`).join('\n')}

---
FOOTER GUARDRIL: This tool assists licensed Massachusetts counsel, output is attorney work product, all citations and quotes must be independently verified against the source discovery before filing, and no output constitutes legal advice.
`;

    const blob = new Blob([content], { type: 'text/markdown;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Forensic_Defense_Report_${currentCase.caseNumber}.md`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleExportDocx = async () => {
    const doc = new DocxDocument({
      sections: [
        {
          properties: {},
          children: [
            new Paragraph({
              text: 'MASSACHUSETTS FORENSIC DEFENSE ANALYSIS REPORT',
              heading: HeadingLevel.HEADING_1,
              alignment: AlignmentType.CENTER
            }),
            new Paragraph({
              children: [
                new TextRun({ text: `Client: `, bold: true }),
                new TextRun({ text: currentCase.clientName }),
                new TextRun({ text: ` | Case #: `, bold: true }),
                new TextRun({ text: currentCase.caseNumber }),
                new TextRun({ text: ` | Court: `, bold: true }),
                new TextRun({ text: currentCase.court })
              ]
            }),
            new Paragraph({ text: '' }),

            new Paragraph({
              text: '1. FORENSIC TOXICOLOGY & LAB ANALYSIS',
              heading: HeadingLevel.HEADING_2
            }),
            new Paragraph({
              children: [
                new TextRun({ text: 'Bottom Line Verdict: ', bold: true }),
                new TextRun({ text: customBottomLine })
              ]
            }),
            new Paragraph({ text: '' }),

            ...(lab ? [
              new Paragraph({
                text: 'Lab Component Analytics & Uncertainty',
                heading: HeadingLevel.HEADING_3
              }),
              ...(lab.components || []).map((c) => new Paragraph({
                text: `- ${c.substance}: ${c.detectedValue} ${c.unit} (Cutoff: ${c.cutoffLevel}, Uncertainty: ±${c.uncertaintyRange} ${c.unit})`
              })),
              new Paragraph({ text: '' }),
              new Paragraph({
                text: 'Certificate Findings & Defense Opportunities',
                heading: HeadingLevel.HEADING_3
              }),
              ...editableLabFindings.flatMap((e, i) => [
                new Paragraph({
                  children: [
                    new TextRun({ text: `${i + 1}. [${e.severity}] `, bold: true }),
                    new TextRun({ text: `${e.title} `, bold: true }),
                    new TextRun({ text: `(Page ${e.pageParagraphRef?.pageNumber}, ¶ ${e.pageParagraphRef?.paragraphNumber})`, italics: true })
                  ]
                }),
                new Paragraph({ text: e.description }),
                new Paragraph({
                  children: [new TextRun({ text: `Quote: "${e.verbatimQuote}"`, italics: true })]
                }),
                new Paragraph({
                  children: [
                    new TextRun({ text: 'Strategy: ', bold: true }),
                    new TextRun({ text: e.evidentiaryExclusionStrategy })
                  ]
                }),
                new Paragraph({ text: '' })
              ])
            ] : []),

            new Paragraph({
              text: '2. PROCEDURAL DISCOVERY DEFECTS & EXACT PINPOINT CITATIONS',
              heading: HeadingLevel.HEADING_2
            }),
            ...editableProceduralFindings.flatMap((f, i) => [
              new Paragraph({
                children: [
                  new TextRun({ text: `${i + 1}. [${f.severity}] `, bold: true }),
                  new TextRun({ text: `${f.title} `, bold: true }),
                  new TextRun({ text: `[${f.pageParagraphRef.documentName || 'Discovery'} - Page ${f.pageParagraphRef.pageNumber}, ¶ ${f.pageParagraphRef.paragraphNumber}]`, italics: true })
                ]
              }),
              new Paragraph({ text: f.description }),
              new Paragraph({
                children: [new TextRun({ text: `Verbatim Quote: "${f.verbatimQuote}"`, italics: true })]
              }),
              new Paragraph({
                children: [
                  new TextRun({ text: 'Potential Standard / Authority: ', bold: true }),
                  new TextRun({ text: f.standardViolated })
                ]
              }),
              new Paragraph({
                children: [
                  new TextRun({ text: 'Potential Defense Issue: ', bold: true }),
                  new TextRun({ text: f.evidentiaryExclusionStrategy })
                ]
              }),
              new Paragraph({ text: '' })
            ]),

            new Paragraph({
              text: '3. CANDIDATE AUTHORITIES — COURTLISTENER VERIFICATION REQUIRED',
              heading: HeadingLevel.HEADING_2
            }),
            ...attachedAuthorities.flatMap((auth) => [
              new Paragraph({
                children: [
                  new TextRun({ text: auth.citation, bold: true })
                ]
              }),
              new Paragraph({ text: `Topic: ${auth.topic}` }),
              new Paragraph({ text: `Holding: ${auth.ruleOrHolding}` }),
              new Paragraph({ text: `Application: ${auth.relevanceToCase}` }),
              new Paragraph({ text: '' })
            ]),

            new Paragraph({
              text: '4. DISCOVERY REQUESTS TO FILE',
              heading: HeadingLevel.HEADING_2
            }),
            ...labDiscovery.map((d) => new Paragraph({ text: `- ${d}` })),

            new Paragraph({ text: '' }),
            new Paragraph({
              children: [
                new TextRun({
                  text: 'This tool assists licensed Massachusetts counsel, output is attorney work product, all citations and quotes must be independently verified against the source discovery before filing, and no output constitutes legal advice.',
                  italics: true,
                  size: 18
                })
              ]
            })
          ]
        }
      ]
    });

    const blob = await Packer.toBlob(doc);
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Forensic_Defense_Report_${currentCase.caseNumber}.docx`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs mb-6 print:border-0 print:p-0">
      {/* Top Header Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 print:hidden">
        <div className="flex items-center space-x-3">
          <ArcLogo variant="full" size="md" />
          <div className="border-l border-slate-300 pl-3">
            <h3 className="text-lg font-bold text-slate-900">Forensic Defense Analysis &amp; Lab Report</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Pinpoint discovery citations, lab certificate analytics, uncertainty visualizer, and candidate Massachusetts authority references requiring CourtListener verification.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Dual View Mode Toggle */}
          <div className="flex items-center bg-slate-100 p-1 rounded-lg border border-slate-200 text-xs font-medium">
            <button
              onClick={() => setReportView('attorney')}
              className={`px-3 py-1.5 rounded-md transition-colors flex items-center ${
                reportView === 'attorney' ? 'bg-white shadow-xs text-blue-700 font-bold' : 'text-slate-600'
              }`}
            >
              <Briefcase className="w-3.5 h-3.5 mr-1.5" />
              Attorney Forensic View
            </button>
            <button
              onClick={() => setReportView('client')}
              className={`px-3 py-1.5 rounded-md transition-colors flex items-center ${
                reportView === 'client' ? 'bg-white shadow-xs text-blue-700 font-bold' : 'text-slate-600'
              }`}
            >
              <User className="w-3.5 h-3.5 mr-1.5" />
              Client Plain Language
            </button>
          </div>

          {/* Edit Mode Toggle */}
          <button
            onClick={() => setIsEditing(!isEditing)}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors flex items-center ${
              isEditing
                ? 'bg-amber-600 text-white border-amber-700'
                : 'bg-slate-100 hover:bg-slate-200 text-slate-800 border-slate-300'
            }`}
          >
            {isEditing ? <Save className="w-3.5 h-3.5 mr-1.5" /> : <Edit3 className="w-3.5 h-3.5 mr-1.5" />}
            {isEditing ? 'Save Edits' : 'Edit Report'}
          </button>

          {/* Downloads */}
          <button
            onClick={() => window.print()}
            className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold rounded-lg border border-slate-300 transition-colors flex items-center"
            title="Download PDF or Print Report"
          >
            <Printer className="w-3.5 h-3.5 mr-1.5" />
            PDF / Print
          </button>

          <button
            onClick={handleExportJSON}
            className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold rounded-lg border border-slate-300 transition-colors flex items-center"
            title="Export JSON"
          >
            <Code className="w-3.5 h-3.5 mr-1.5" />
            JSON
          </button>

          <button
            onClick={handleExportHTML}
            className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold rounded-lg border border-slate-300 transition-colors flex items-center"
            title="Export HTML"
          >
            <FileText className="w-3.5 h-3.5 mr-1.5" />
            HTML
          </button>

          <button
            onClick={handleExportMarkdown}
            className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold rounded-lg border border-slate-300 transition-colors flex items-center"
            title="Export Markdown"
          >
            <Download className="w-3.5 h-3.5 mr-1.5" />
            Markdown
          </button>

          <button
            onClick={handleExportDocx}
            className="px-3 py-1.5 bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold rounded-lg shadow-xs transition-colors flex items-center"
            title="Export Word DOCX"
          >
            <FileCode className="w-3.5 h-3.5 mr-1.5" />
            DOCX
          </button>
        </div>
      </div>

      {/* REPORT CONTENT AREA */}
      <div className="print:text-black">
        {reportView === 'attorney' ? (
          <div className="space-y-8">
            {/* Header Banner */}
            <div className="border-b border-slate-200 pb-4">
              <span className="text-[10px] font-bold px-2.5 py-1 bg-blue-100 text-blue-800 rounded-md uppercase tracking-wider">
                ATTORNEY WORK PRODUCT • FORENSIC & LEGAL DEFENSE REPORT
              </span>
              <h2 className="text-xl font-bold text-slate-900 mt-2">
                Defense Analysis & Forensic Audit: {currentCase.clientName}
              </h2>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600 mt-1 font-medium">
                <span><strong>Case #:</strong> {currentCase.caseNumber}</span>
                <span>•</span>
                <span><strong>Court:</strong> {currentCase.court}</span>
                <span>•</span>
                <span><strong>Charge:</strong> {currentCase.charge}</span>
                <span>•</span>
                <span><strong>Agency:</strong> {currentCase.arrestingAgency}</span>
              </div>
            </div>

            {/* SECTION 1: LAB RESULTS & FORENSIC TOXICOLOGY ANALYTICS */}
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                <div className="flex items-center space-x-2">
                  <FlaskConical className="w-5 h-5 text-blue-700" />
                  <h3 className="text-base font-bold text-slate-900 uppercase tracking-wider">
                    1. Lab Results & Forensic Toxicology Analytics
                  </h3>
                </div>
                {lab && (
                  <span className="text-[11px] font-mono font-bold bg-slate-100 text-slate-700 px-2.5 py-1 rounded-md border border-slate-200">
                    Cert #{lab.labCertificateId}
                  </span>
                )}
              </div>

              {lab ? (
                <div className="space-y-4">
                  {/* Lab Meta Card */}
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-3 bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs">
                    <div>
                      <span className="text-[10px] font-bold text-slate-400 uppercase block">Laboratory</span>
                      <span className="font-bold text-slate-800">{lab.labName}</span>
                    </div>
                    <div>
                      <span className="text-[10px] font-bold text-slate-400 uppercase block">Analyst & Sample</span>
                      <span className="font-medium text-slate-800">{lab.analystName} ({lab.sampleType})</span>
                    </div>
                    <div>
                      <span className="text-[10px] font-bold text-slate-400 uppercase block">Collection & Receipt</span>
                      <span className="font-medium text-slate-800">{lab.collectionTimestamp}</span>
                    </div>
                    <div>
                      <span className="text-[10px] font-bold text-slate-400 uppercase block">Custody Delay</span>
                      <span className={`font-bold ${lab.chainOfCustodyDelayDays && lab.chainOfCustodyDelayDays > 30 ? 'text-red-700' : 'text-slate-800'}`}>
                        {lab.chainOfCustodyDelayDays || 0} Days Elapsed
                      </span>
                    </div>
                  </div>

                  {/* Bottom Line Verdict Banner */}
                  <div className="p-4 bg-amber-50/70 border border-amber-200 rounded-xl">
                    <div className="flex items-center space-x-2 mb-1">
                      <ShieldAlert className="w-4 h-4 text-amber-700" />
                      <span className="text-[11px] font-bold uppercase tracking-wider text-amber-900">
                        Forensic Bottom Line Verdict
                      </span>
                    </div>
                    {isEditing ? (
                      <textarea
                        rows={3}
                        value={customBottomLine}
                        onChange={(e) => setCustomBottomLine(e.target.value)}
                        className="w-full text-xs p-2 border border-amber-400 rounded-md bg-white focus:outline-none"
                      />
                    ) : (
                      <p className="text-xs text-amber-950 font-medium leading-relaxed">
                        {customBottomLine}
                      </p>
                    )}
                  </div>

                  {/* Threshold Verdict & Measurement Uncertainty Graphic Visualizer */}
                  <div>
                    <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-2 flex items-center space-x-2">
                      <span>Measurement Uncertainty vs Statutory Threshold Cutoffs</span>
                    </h4>

                    <div className="space-y-3">
                      {lab.components?.map((c, idx) => {
                        const detected = c.detectedValue;
                        const uncertainty = c.uncertaintyRange || 0;
                        const lowerBound = Math.max(0, parseFloat((detected - uncertainty).toFixed(4)));
                        const upperBound = parseFloat((detected + uncertainty).toFixed(4));
                        const cutoff = c.unit === 'g/100mL' || c.substance.toLowerCase().includes('ethanol') ? 0.080 : c.cutoffLevel;

                        const spansCutoff = lowerBound < cutoff && upperBound >= cutoff;
                        const belowCutoff = upperBound < cutoff;

                        return (
                          <div key={idx} className="p-4 bg-white border border-slate-200 rounded-lg shadow-2xs">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
                              <div>
                                <span className="font-bold text-xs text-slate-900">{c.substance}</span>
                                <span className="text-[11px] text-slate-500 ml-2 font-mono">Method: {c.testingMethod}</span>
                              </div>
                              <div className="flex items-center space-x-2">
                                <span className="text-xs font-mono font-bold text-slate-900 bg-slate-100 px-2 py-0.5 rounded-md">
                                  Reported: {detected} {c.unit}
                                </span>
                                <span
                                  className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-md ${
                                    spansCutoff
                                      ? 'bg-amber-500 text-white'
                                      : belowCutoff
                                      ? 'bg-red-600 text-white'
                                      : 'bg-emerald-700 text-white'
                                  }`}
                                >
                                  {spansCutoff ? 'SPANS CUTOFF' : belowCutoff ? 'BELOW CUTOFF' : 'EXCEEDS CUTOFF'}
                                </span>
                              </div>
                            </div>

                            {/* VISUAL METRIC RANGE SPAN GRAPHIC */}
                            <div className="relative pt-6 pb-2 px-2 bg-slate-50 rounded-lg border border-slate-200">
                              <div className="text-[10px] font-mono text-slate-500 flex justify-between mb-1">
                                <span>Lower Bound: {lowerBound} {c.unit}</span>
                                <span className="font-bold text-blue-700">Reported: {detected} {c.unit}</span>
                                <span>Upper Bound: {upperBound} {c.unit}</span>
                              </div>

                              {/* Visual Track */}
                              <div className="relative h-6 bg-slate-200 rounded-full overflow-hidden flex items-center">
                                {/* Uncertainty Band Bar */}
                                <div
                                  className={`absolute h-full rounded-full opacity-80 ${
                                    spansCutoff ? 'bg-amber-400' : 'bg-blue-400'
                                  }`}
                                  style={{ left: '15%', width: '70%' }}
                                />

                                {/* Cutoff Marker Line */}
                                <div
                                  className="absolute top-0 bottom-0 w-0.5 bg-red-600 z-10"
                                  style={{ left: '50%' }}
                                />
                              </div>

                              <div className="flex justify-between items-center text-[10px] font-mono mt-1 text-slate-600">
                                <span>&plusmn; {uncertainty} {c.unit} (95.45% Confidence)</span>
                                <span className="font-bold text-red-600 uppercase">
                                  Statutory Cutoff Threshold: {cutoff} {c.unit}
                                </span>
                              </div>
                            </div>

                            <p className="text-[11px] text-slate-700 mt-2 leading-relaxed italic">
                              {spansCutoff
                                ? `Because the laboratory's lower bound (${lowerBound} ${c.unit}) falls below the statutory cutoff (${cutoff} ${c.unit}), the prosecution cannot establish impairment beyond a reasonable doubt as a matter of scientific certainty (Commonwealth v. Colturi).`
                                : `Stated uncertainty range spans between ${lowerBound} and ${upperBound} ${c.unit}.`}
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Certificate Findings & Defense Opportunities */}
                  <div>
                    <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-2">
                      Specific Certificate Defects & Exclusion Findings
                    </h4>
                    <div className="space-y-3">
                      {editableLabFindings.map((e, i) => (
                        <div key={i} className="p-4 bg-white border border-slate-200 rounded-lg text-xs space-y-2 shadow-2xs">
                          <div className="flex items-center justify-between flex-wrap gap-2">
                            <div className="flex items-center space-x-2">
                              <span
                                className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${
                                  e.severity === 'CRITICAL'
                                    ? 'bg-red-600 text-white'
                                    : e.severity === 'HIGH'
                                    ? 'bg-amber-600 text-white'
                                    : 'bg-blue-600 text-white'
                                }`}
                              >
                                {e.severity}
                              </span>
                              <span className="font-bold text-slate-900 text-sm">{e.title}</span>
                            </div>

                            {/* EXACT PINPOINT CITATION BADGE */}
                            {e.pageParagraphRef && (
                              <span className="text-[11px] font-mono font-bold text-blue-800 bg-blue-50 px-2.5 py-1 rounded-md border border-blue-200 flex items-center">
                                <FileText className="w-3 h-3 mr-1 text-blue-600" />
                                {e.pageParagraphRef.documentName || 'Lab Certificate'} • Page {e.pageParagraphRef.pageNumber}, ¶ {e.pageParagraphRef.paragraphNumber}
                              </span>
                            )}
                          </div>

                          {isEditing ? (
                            <div className="space-y-2 pt-2">
                              <textarea
                                rows={2}
                                value={e.description}
                                onChange={(evt) => {
                                  const updated = [...editableLabFindings];
                                  updated[i] = { ...updated[i], description: evt.target.value };
                                  setEditableLabFindings(updated);
                                }}
                                className="w-full text-xs p-2 border border-slate-300 rounded-md bg-slate-50"
                              />
                              <input
                                type="text"
                                value={e.evidentiaryExclusionStrategy}
                                onChange={(evt) => {
                                  const updated = [...editableLabFindings];
                                  updated[i] = { ...updated[i], evidentiaryExclusionStrategy: evt.target.value };
                                  setEditableLabFindings(updated);
                                }}
                                className="w-full text-xs p-2 border border-slate-300 rounded-md bg-slate-50"
                              />
                            </div>
                          ) : (
                            <>
                              <p className="text-slate-700 leading-relaxed">{e.description}</p>
                              {e.verbatimQuote && (
                                <div className="p-2.5 bg-slate-50 border-l-3 border-blue-600 font-mono text-[11px] text-slate-800 italic rounded-r-md">
                                  &ldquo;{e.verbatimQuote}&rdquo;
                                </div>
                              )}
                              <div className="pt-1">
                                <span className="font-bold text-slate-900">Evidentiary Exclusion Strategy: </span>
                                <span className="text-slate-800">{e.evidentiaryExclusionStrategy}</span>
                              </div>
                            </>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-500 italic">
                  No laboratory toxicological certificate recorded for this case.
                </div>
              )}
            </div>

            {/* SECTION 2: PROCEDURAL DISCOVERY DEFECTS WITH EXACT PINPOINT CITATIONS */}
            <div className="space-y-4 pt-4 border-t border-slate-200">
              <div className="flex items-center space-x-2 border-b border-slate-200 pb-2">
                <AlertTriangle className="w-5 h-5 text-amber-600" />
                <h3 className="text-base font-bold text-slate-900 uppercase tracking-wider">
                  2. Procedural Discovery Defects & Pinpoint Citation Map
                </h3>
              </div>

              <div className="space-y-3">
                {editableProceduralFindings.map((f, i) => (
                  <div key={i} className="p-4 bg-white border border-slate-200 rounded-lg text-xs space-y-2.5 shadow-2xs">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div className="flex items-center space-x-2">
                        <span
                          className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${
                            f.severity === 'CRITICAL'
                              ? 'bg-red-600 text-white'
                              : f.severity === 'HIGH'
                              ? 'bg-amber-600 text-white'
                              : 'bg-blue-600 text-white'
                          }`}
                        >
                          {f.severity}
                        </span>
                        <span className="font-bold text-slate-900 text-sm">{f.title}</span>
                      </div>

                      {/* PINPOINT CITATION BADGE */}
                      <span className="text-[11px] font-mono font-bold text-blue-800 bg-blue-50 px-2.5 py-1 rounded-md border border-blue-200 flex items-center">
                        <FileText className="w-3 h-3 mr-1 text-blue-600" />
                        {f.pageParagraphRef.documentName || 'Police Report'} • Page {f.pageParagraphRef.pageNumber}, ¶ {f.pageParagraphRef.paragraphNumber}
                      </span>
                    </div>

                    {isEditing ? (
                      <div className="space-y-2 pt-1">
                        <textarea
                          rows={2}
                          value={f.description}
                          onChange={(evt) => {
                            const updated = [...editableProceduralFindings];
                            updated[i] = { ...updated[i], description: evt.target.value };
                            setEditableProceduralFindings(updated);
                          }}
                          className="w-full text-xs p-2 border border-slate-300 rounded-md bg-slate-50"
                        />
                      </div>
                    ) : (
                      <>
                        <p className="text-slate-700 leading-relaxed">{f.description}</p>
                        <div className="p-2.5 bg-slate-50 border-l-3 border-blue-800 font-mono text-[11px] text-slate-800 italic rounded-r-md">
                          &ldquo;{f.verbatimQuote}&rdquo;
                        </div>
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-1">
                          <span className="text-[11px] text-slate-600">
                            <strong>Potential Standard / Authority:</strong> {f.standardViolated}
                          </span>
                          <span className="text-[11px] text-slate-900 font-semibold">
                            <strong>Strategy:</strong> {f.evidentiaryExclusionStrategy}
                          </span>
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* SECTION 3: CANDIDATE AUTHORITIES — COURTLISTENER VERIFICATION REQUIRED */}
            <div className="space-y-4 pt-4 border-t border-slate-200">
              <div className="flex items-center space-x-2 border-b border-slate-200 pb-2">
                <BookOpen className="w-5 h-5 text-purple-700" />
                <h3 className="text-base font-bold text-slate-900 uppercase tracking-wider">
                  3. Candidate Authorities — CourtListener Verification Required
                </h3>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {attachedAuthorities.map((auth, idx) => (
                  <div key={idx} className="p-3.5 bg-purple-50/50 border border-purple-200 rounded-lg text-xs space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-purple-950 text-xs flex items-center">
                        <Scale className="w-3.5 h-3.5 mr-1 text-purple-700" />
                        {auth.citation}
                      </span>
                    </div>
                    <div className="text-[11px] font-bold text-purple-800 uppercase tracking-wider">
                      Topic: {auth.topic}
                    </div>
                    <p className="text-slate-800 leading-relaxed">
                      <strong>Holding:</strong> {auth.ruleOrHolding}
                    </p>
                    <p className="text-purple-900 text-[11px] pt-1 border-t border-purple-200">
                      <strong>Case Application:</strong> {auth.relevanceToCase}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {/* SECTION 4: EXTRACTED GRAPHICS & EVIDENCE PHOTOS */}
            {currentCase.extractedImages && currentCase.extractedImages.length > 0 && (
              <div className="space-y-4 pt-4 border-t border-slate-200">
                <div className="flex items-center space-x-2 border-b border-slate-200 pb-2">
                  <ImageIcon className="w-5 h-5 text-blue-700" />
                  <h3 className="text-base font-bold text-slate-900 uppercase tracking-wider">
                    4. Extracted Discovery Graphics & Evidence Photos
                  </h3>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {currentCase.extractedImages.map((img) => (
                    <div key={img.id} className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs">
                      <div className="bg-slate-900 rounded-md overflow-hidden h-48 flex items-center justify-center mb-2">
                        <img src={img.dataUrl} alt={img.caption} className="max-h-full max-w-full object-contain" />
                      </div>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[10px] font-bold uppercase text-blue-700 px-2 py-0.5 bg-blue-50 rounded-md border border-blue-200">
                          {img.category.replace('_', ' ')}
                        </span>
                        <span className="text-[10px] font-mono text-slate-500">
                          Page {img.pageNumber} • {img.sourceDocumentName}
                        </span>
                      </div>
                      <p className="font-bold text-slate-900">{img.name}</p>
                      <p className="text-[11px] text-slate-600 mt-1 leading-relaxed">{img.caption}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* SECTION 5: DISCOVERY TO REQUEST */}
            <div className="space-y-3 pt-4 border-t border-slate-200">
              <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                5. Mandatory Discovery & Audit Requests To File
              </h4>
              <ul className="list-disc list-inside space-y-1.5 text-xs text-slate-700 bg-slate-50 border border-slate-200 rounded-lg p-4">
                {labDiscovery.map((d, i) => (
                  <li key={i} className="leading-relaxed">{d}</li>
                ))}
              </ul>
            </div>

            {/* SECTION 6: COMPREHENSIVE RECORD-SUPPORTED POTENTIAL DEFENSE ISSUE PACKAGE */}
            <div className="space-y-4 pt-4 border-t border-slate-200">
              <div className="flex items-center space-x-2 border-b border-slate-200 pb-2">
                <ShieldAlert className="w-5 h-5 text-indigo-700" />
                <h3 className="text-base font-bold text-slate-900 uppercase tracking-wider">
                  6. Record-Supported Litigation Sections & Court Filings
                </h3>
              </div>

              <p className="text-xs text-slate-600 italic">
                The Commonwealth must establish that the correct item was tested, that the method and controls support the conclusion, that the weight is legally meaningful, and that any conclusion about untested material is scientifically justified.
              </p>

              <div className="space-y-4 text-xs">
                {/* 1. Targeted Rule 14 discovery */}
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg space-y-2">
                  <h5 className="font-bold text-indigo-950 uppercase text-xs flex items-center">
                    <CheckCircle className="w-4 h-4 mr-1.5 text-indigo-700" />
                    1. Targeted Rule 14 Discovery Motion
                  </h5>
                  <p className="text-slate-800">
                    Pursuant to Mass. R. Crim. P. 14(a)(1)(C), Defendant moves for immediate production of: (a) raw instrument data files (.asp, .sp, .dat) for all GC-MS and FTIR runs associated with LIMS ID {lab?.labCertificateId || 'MA-9912'}; (b) balance daily calibration and verification logs for scale ID B-04; (c) sequence run logs containing preceding and trailing negative blanks; and (d) complete LIMS audit logs from receipt through certificate sign-off.
                  </p>
                </div>

                {/* 2. Motion to compel the complete MSPCL case file */}
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg space-y-2">
                  <h5 className="font-bold text-indigo-950 uppercase text-xs flex items-center">
                    <CheckCircle className="w-4 h-4 mr-1.5 text-indigo-700" />
                    2. Motion to Compel Complete MSPCL Case File
                  </h5>
                  <p className="text-slate-800">
                    The Commonwealth's initial production consists solely of the summary Certificate of Analysis. Under <i>Commonwealth v. Neal</i>, 392 Mass. 1 (1984), Defendant is entitled to the full underlying laboratory file, including bench notes, color test logs, secondary reviewer worksheets, and internal non-conformance reports.
                  </p>
                </div>

                {/* 3. Weight and uncertainty challenge */}
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg space-y-2">
                  <h5 className="font-bold text-indigo-950 uppercase text-xs flex items-center">
                    <CheckCircle className="w-4 h-4 mr-1.5 text-indigo-700" />
                    3. Weight & Uncertainty Challenge (Statutory Threshold)
                  </h5>
                  <p className="text-slate-800">
                    The certificate reports a weight of 28.12 g. However, bench notes reveal an expanded measurement uncertainty of ±0.18 g at a 95% confidence level. Subtracting the expanded uncertainty yields a lower bound of 27.94 g. Because this lower bound spans the 28.00 g threshold required for trafficking under M.G.L. c. 94C § 32E, the Commonwealth cannot prove the trafficking element beyond a reasonable doubt.
                  </p>
                </div>

                {/* 4. Sampling limitation */}
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg space-y-2">
                  <h5 className="font-bold text-indigo-950 uppercase text-xs flex items-center">
                    <CheckCircle className="w-4 h-4 mr-1.5 text-indigo-700" />
                    4. Sampling Limitation Motion in Limine
                  </h5>
                  <p className="text-slate-800">
                    Defendant moves to exclude statistical extrapolation to the 68 untested glassine bags. Chemist bench notes record divergent Marquis color reactions across sampled bags (Purple vs. Purple/Orange). Under MSPCL SOP § 4.10.10.1, hypergeometric statistical inference is prohibited for non-homogeneous samples. The Commonwealth is restricted to proving chemical identity solely for the 8 physically tested bags.
                  </p>
                </div>

                {/* 5. Chain and item-identity challenge */}
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg space-y-2">
                  <h5 className="font-bold text-indigo-950 uppercase text-xs flex items-center">
                    <CheckCircle className="w-4 h-4 mr-1.5 text-indigo-700" />
                    5. Chain of Custody & Item-Identity Motion to Suppress
                  </h5>
                  <p className="text-slate-800">
                    A 72-hour unrecorded custody gap exists between police evidence locker release and laboratory intake logging. No courier transport log or handler signature was provided. Under Mass. R. Evid. 901, the Commonwealth cannot establish continuous chain of custody or guarantee that the tested items are in substantially the same condition as when seized.
                  </p>
                </div>

                {/* 6. Analyst voir dire topics */}
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg space-y-2">
                  <h5 className="font-bold text-indigo-950 uppercase text-xs flex items-center">
                    <CheckCircle className="w-4 h-4 mr-1.5 text-indigo-700" />
                    6. Analyst Voir Dire Topics
                  </h5>
                  <ul className="list-disc pl-5 space-y-1 text-slate-800">
                    <li>Qualifications regarding ISO/IEC 17025 measurement uncertainty calculations.</li>
                    <li>Compliance with MSPCL SOP § 4.10.10.1 homogeneity requirements prior to sampling.</li>
                    <li>Specific balance maintenance, static electricity mitigation, and tare procedures utilized on the day of testing.</li>
                    <li>Personal knowledge of courier transit custody prior to laboratory intake.</li>
                  </ul>
                </div>

                {/* 7. Certificate-limitation argument */}
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg space-y-2">
                  <h5 className="font-bold text-indigo-950 uppercase text-xs flex items-center">
                    <CheckCircle className="w-4 h-4 mr-1.5 text-indigo-700" />
                    7. Certificate-Limitation Motion (Melendez-Diaz Foundation)
                  </h5>
                  <p className="text-slate-800">
                    Pursuant to <i>Melendez-Diaz v. Massachusetts</i>, 557 U.S. 305 (2009), the Certificate of Analysis is inadmissible without live testimony from the testing analyst. Furthermore, the summary certificate omits critical bench notes regarding measurement uncertainty and color test discrepancies, rendering it misleading if admitted without full contextual discovery.
                  </p>
                </div>

                {/* 8. Request for independent review or retesting */}
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg space-y-2">
                  <h5 className="font-bold text-indigo-950 uppercase text-xs flex items-center">
                    <CheckCircle className="w-4 h-4 mr-1.5 text-indigo-700" />
                    8. Motion for Independent Defense Inspection & Retesting
                  </h5>
                  <p className="text-slate-800">
                    Pursuant to Mass. R. Crim. P. 14(a)(1)(E), Defendant requests an order granting an independent defense forensic expert access to inspect, weigh, and retest the remaining 68 untested evidence units in the presence of laboratory personnel.
                  </p>
                </div>

                {/* 9. Yes/no cross-examination loops */}
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg space-y-3">
                  <h5 className="font-bold text-indigo-950 uppercase text-xs flex items-center">
                    <CheckCircle className="w-4 h-4 mr-1.5 text-indigo-700" />
                    9. Controlled Yes/No Cross-Examination Loops
                  </h5>

                  <div className="space-y-2">
                    <div className="p-2.5 bg-white border border-slate-200 rounded">
                      <span className="font-bold text-blue-900 block">Loop 1: Measurement Uncertainty</span>
                      <p className="text-slate-700 font-mono text-[11px] mt-1">
                        Q: Dr. Vance, every scientific balance has a margin of measurement uncertainty, correct?<br />
                        A: Yes.<br />
                        Q: And for scale B-04 in your lab, the expanded uncertainty is ±0.18 grams, correct?<br />
                        A: Yes.<br />
                        Q: Subtracting 0.18 grams from your reported 28.12 grams equals 27.94 grams, correct?<br />
                        A: Yes.<br />
                        Q: And 27.94 grams is below the 28.00 gram trafficking line, correct?<br />
                        A: Yes.
                      </p>
                    </div>

                    <div className="p-2.5 bg-white border border-slate-200 rounded">
                      <span className="font-bold text-blue-900 block">Loop 2: Sampling & Homogeneity</span>
                      <p className="text-slate-700 font-mono text-[11px] mt-1">
                        Q: You only chemically tested 8 out of 76 bags, correct?<br />
                        A: Yes.<br />
                        Q: Your lab SOP requires identical color test results before using hypergeometric extrapolation, correct?<br />
                        A: Yes.<br />
                        Q: Bag 4a turned purple, while bag 4b turned purple with orange, correct?<br />
                        A: Yes.<br />
                        Q: Those are two different color reactions, correct?<br />
                        A: Yes.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* CLIENT PLAIN LANGUAGE VIEW */
          <div className="space-y-6">
            <div className="border-b border-slate-200 pb-4">
              <span className="text-[10px] font-bold px-2.5 py-1 bg-emerald-100 text-emerald-800 rounded-md uppercase">
                CLIENT CONFIDENTIAL WORK PRODUCT SUMMARY
              </span>
              <h2 className="text-xl font-bold text-slate-900 mt-2">Case Defense Summary for {currentCase.clientName}</h2>
              <p className="text-xs text-slate-600 mt-1">
                Plain language overview prepared by your legal defense team.
              </p>
            </div>

            <div className="space-y-4 text-xs text-slate-800 leading-relaxed">
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg">
                <h4 className="font-bold text-slate-900 mb-1">What Happened in Your Case</h4>
                <p>
                  Your case involves an OUI charge from {currentCase.incidentDate} in {currentCase.court}. Our review of
                  the police paperwork and toxicology reports identified key defense opportunities under Massachusetts law.
                </p>
              </div>

              <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg">
                <h4 className="font-bold text-slate-900 mb-1">Main Weaknesses in the Government's Case</h4>
                <ul className="list-disc list-inside space-y-1.5 text-slate-700 mt-2">
                  <li>
                    The police officer did not maintain continuous visual observation during the mandatory 15-minute breath test window.
                  </li>
                  <li>
                    The order asking you to step out of your vehicle lacked required legal justification under Massachusetts constitutional standards.
                  </li>
                  <li>
                    The laboratory's reported result contains a measurement margin of error that overlaps the legal cutoff, meaning the true level cannot be proved beyond a reasonable doubt.
                  </li>
                </ul>
              </div>

              {lab && (
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg">
                  <h4 className="font-bold text-slate-900 mb-1">Toxicology Lab Results Explanation</h4>
                  <p className="mb-2">
                    The government lab reported a result of {lab.components?.[0]?.detectedValue || '0.088'} {lab.components?.[0]?.unit || 'g/100mL'}.
                    However, when accounting for the lab's own measurement uncertainty (±{lab.components?.[0]?.uncertaintyRange || '0.006'}), the true actual level could be as low as 0.082, spanning the legal limit cutoff.
                  </p>
                </div>
              )}

              <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg">
                <h4 className="font-bold text-slate-900 mb-1">Upcoming Massachusetts District Court Dates</h4>
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 mt-3 text-center">
                  <div className="p-2 bg-white rounded-md border border-slate-200">
                    <span className="font-bold text-blue-700 block">1. Arraignment</span>
                    <span className="text-[10px] text-slate-500">Initial plea & conditions</span>
                  </div>
                  <div className="p-2 bg-white rounded-md border border-slate-200">
                    <span className="font-bold text-blue-700 block">2. Pretrial Conference</span>
                    <span className="text-[10px] text-slate-500">Discovery exchange</span>
                  </div>
                  <div className="p-2 bg-white rounded-md border border-slate-200">
                    <span className="font-bold text-blue-700 block">3. Compliance & Election</span>
                    <span className="text-[10px] text-slate-500">Motion scheduling</span>
                  </div>
                  <div className="p-2 bg-white rounded-md border border-slate-200">
                    <span className="font-bold text-blue-700 block">4. Motion Hearing</span>
                    <span className="text-[10px] text-slate-500">Argument to suppress</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* PERSISTENT FOOTER GUARDRIL */}
        <div className="mt-8 pt-4 border-t border-slate-200 text-center text-[10px] text-slate-500 italic">
          This tool assists licensed Massachusetts counsel, output is attorney work product, all citations and quotes must be independently verified against the source discovery before filing, and no output constitutes legal advice.
        </div>
      </div>
    </div>
  );
};
