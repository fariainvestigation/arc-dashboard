import { CaseData } from '../types';

export const SAMPLE_MASSACHUSETTS_CASES: CaseData[] = [
  {
    id: 'case_miller_woburn',
    clientName: 'Arthur Miller',
    caseNumber: '2656CR00142',
    court: 'Woburn District Court (Middlesex County)',
    charge: 'OUI Alcohol (1st Offense), M.G.L. c. 90 § 24',
    incidentDate: '2026-03-14',
    arrestingAgency: 'Woburn Police Department',
    lastUpdated: new Date().toISOString(),
    documents: [
      {
        id: 'doc_miller_report',
        name: 'Woburn_PD_Incident_Report_Miller.pdf',
        type: 'police_report',
        uploadDate: '2026-03-15',
        status: 'parsed',
        parsedText: `[Page 1]
Paragraph 1: On Saturday, March 14, 2026, at approximately 01:10 hours, I was on uniform patrol in Woburn, MA. At 01:12 hours, I observed a motor vehicle traveling northbound on Main Street.

Paragraph 2: Upon making personal contact with the driver, Arthur Miller, I detected a moderate odor of intoxicating liquor emanating from his breath. I requested his driver license and vehicle registration.

Paragraph 3: I ordered the subject to exit the motor vehicle for roadside field sobriety testing. The driver complied without incident.

Paragraph 4: I instructed the subject on the Walk and Turn test. I told the driver to walk down the white pavement line and keep his balance. Subject lost balance twice during testing.

[Page 2]
Paragraph 1: Subject was placed under arrest for OUI Alcohol and transported to Woburn Police station for booking. Observation started at 01:15 hours.

Paragraph 2: During the observation period, I entered incident notes on cruiser laptop computer and retrieved booking paperwork from the desktop drawer.

Paragraph 3: Draeger Alcotest 9510 sequence started at 01:30:12 hours. First breath sample recorded BAC 0.092 g/210L. Second sample recorded 0.090 g/210L.

Paragraph 4: In my opinion, the subject failed roadside field sobriety tests establishing marijuana and alcohol intoxication.`,
        pages: [
          {
            pageNumber: 1,
            paragraphs: [
              {
                paragraphNumber: 1,
                text: 'On Saturday, March 14, 2026, at approximately 01:10 hours, I was on uniform patrol in Woburn, MA. At 01:12 hours, I observed a motor vehicle traveling northbound on Main Street.'
              },
              {
                paragraphNumber: 2,
                text: 'Upon making personal contact with the driver, Arthur Miller, I detected a moderate odor of intoxicating liquor emanating from his breath. I requested his driver license and vehicle registration.'
              },
              {
                paragraphNumber: 3,
                text: 'I ordered the subject to exit the motor vehicle for roadside field sobriety testing. The driver complied without incident.'
              },
              {
                paragraphNumber: 4,
                text: 'I instructed the subject on the Walk and Turn test. I told the driver to walk down the white pavement line and keep his balance. Subject lost balance twice during testing.'
              }
            ]
          },
          {
            pageNumber: 2,
            paragraphs: [
              {
                paragraphNumber: 1,
                text: 'Subject was placed under arrest for OUI Alcohol and transported to Woburn Police station for booking. Observation started at 01:15 hours.'
              },
              {
                paragraphNumber: 2,
                text: 'During the observation period, I entered incident notes on cruiser laptop computer and retrieved booking paperwork from the desktop drawer.'
              },
              {
                paragraphNumber: 3,
                text: 'Draeger Alcotest 9510 sequence started at 01:30:12 hours. First breath sample recorded BAC 0.092 g/210L. Second sample recorded 0.090 g/210L.'
              },
              {
                paragraphNumber: 4,
                text: 'In my opinion, the subject failed roadside field sobriety tests establishing marijuana and alcohol intoxication.'
              }
            ]
          }
        ]
      }
    ],
    labResultData: {
      labCertificateId: 'MA-STATE-LAB-2026-9912',
      labName: 'Massachusetts State Police Crime Laboratory - Forensic Chemistry & Toxicology Units',
      analystName: 'Dr. Rebecca Vance, Ph.D. / J. Reynolds, Chemist III',
      sampleType: 'Blood',
      collectionTimestamp: '2026-03-14 02:25:00',
      labReceivedTimestamp: '2026-03-17 11:15:00',
      analysisTimestamp: '2026-03-22 14:30:00',
      chainOfCustodyDelayDays: 3,
      qcBatchNumber: 'BATCH-GCMS-8812',
      qcDeviationNotes: 'Uncertainty of measurement calculated at +/- 0.006 g/100mL at 95.45% confidence interval.',
      chainOfCustodyGaps: [
        'Sample sat at room temperature in Woburn PD evidence locker for 68 hours prior to state courier pickup.',
        'Chain of custody log lacks courier badge number on transfer receipt.'
      ],
      components: [
        {
          substance: 'Ethanol (Blood Alcohol Content)',
          detectedValue: 0.088,
          unit: 'g/100mL',
          cutoffLevel: 0.010,
          therapeuticMin: 0.000,
          toxicMin: 0.080,
          uncertaintyRange: 0.006,
          testingMethod: 'GC-FID (Infrared)',
          qcBatchPassed: true
        },
        {
          substance: 'Delta-9 THC (Active Cannabis Metabolite)',
          detectedValue: 3.2,
          unit: 'ng/mL',
          cutoffLevel: 1.0,
          therapeuticMin: 1.0,
          toxicMin: 5.0,
          uncertaintyRange: 0.4,
          testingMethod: 'LC-MS/MS',
          qcBatchPassed: true
        },
        {
          substance: '11-nor-9-Carboxy-THC (Inactive Metabolite)',
          detectedValue: 28.5,
          unit: 'ng/mL',
          cutoffLevel: 5.0,
          therapeuticMin: 0.0,
          toxicMin: 50.0,
          uncertaintyRange: 2.1,
          testingMethod: 'GC-MS',
          qcBatchPassed: true
        }
      ],
      isSeizedDrugCase: true,
      drugSeizureItems: [
        {
          id: 'item_1_heroin_fentanyl',
          itemDescription: '76 glassine bags containing tan powder (Item 4a-4y)',
          totalItemCount: 76,
          testedItemCount: 8,
          samplingPlanUsed: 'Hypergeometric (k=0.7)',
          reportedNetWeightGrams: 28.12,
          weightUncertaintyGrams: 0.18,
          homogeneityVerified: false,
          colorTestIdentical: false,
          colorTestDetails: 'Marquis test on Items 4a,4f gave Purple; Items 4b,4c gave Purple with slight Orange.',
          primaryMethod: 'FTIR',
          confirmatoryGCMSDone: false,
          isStreetDrugMixture: true,
          statutoryThresholdGrams: 28.00
        }
      ],
      drugPolicyAudits: {
        containsSyringe: true,
        syringeHasHomicideApproval: false,
        drugPackagingDNAOrPrintRequested: true,
        isPossessionOnlyCharge: false,
        isInteriorPackagingProcessed: true,
        interiorPackagingApprovedByDirector: false,
        isFoundItemOrCIBuy: false,
        analystReceivedSuspectContext: true
      },
      ouiToxicologyAudits: {
        isOUIBloodDraw: true,
        testedEthanol: true,
        testedDrugs: false,
        issuedDualSupplementalReport: false
      }
    },
    extractedImages: [
      {
        id: 'img_draeger_ticket',
        name: 'Draeger_Alcotest_9510_Ticket_Scan.png',
        dataUrl: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="400" height="280" viewBox="0 0 400 280"><rect width="400" height="280" fill="%23f8fafc" stroke="%23cbd5e1" stroke-width="4"/><text x="20" y="35" font-family="monospace" font-size="14" font-weight="bold" fill="%230f172a">DRAEGER ALCOTEST 9510 RESULT TICKET</text><line x1="20" y1="45" x2="380" y2="45" stroke="%2394a3b8" stroke-width="2"/><text x="20" y="70" font-family="monospace" font-size="12" fill="%23334155">LOCATION: Woburn PD Station - Room B</text><text x="20" y="90" font-family="monospace" font-size="12" fill="%23334155">OPERATOR: Off. J. Higgins %23441</text><text x="20" y="110" font-family="monospace" font-size="12" fill="%23334155">SUBJECT: Miller, Arthur</text><text x="20" y="130" font-family="monospace" font-size="12" fill="%23334155">OBSERVATION START: 01:15 EST</text><text x="20" y="150" font-family="monospace" font-size="12" fill="%23b91c1c" font-weight="bold">SAMPLE 1 (01:30): 0.092 g/210L</text><text x="20" y="170" font-family="monospace" font-size="12" fill="%23b91c1c" font-weight="bold">SAMPLE 2 (01:32): 0.090 g/210L</text><rect x="20" y="190" width="360" height="60" fill="%23fef3c7" stroke="%23f59e0b" stroke-width="1"/><text x="30" y="215" font-family="monospace" font-size="11" fill="%2392400e" font-weight="bold">NOTE: Log indicates officer typed on laptop</text><text x="30" y="235" font-family="monospace" font-size="11" fill="%2392400e">during 15-min observation window.</text></svg>',
        sourceDocumentName: 'Woburn_PD_Incident_Report_Miller.pdf',
        pageNumber: 2,
        caption: 'Draeger Alcotest 9510 printout ticket showing breath test timings and readings.',
        category: 'DOCUMENT_SCAN',
        selectedForReport: true,
        timestamp: '2026-03-14 01:32:00'
      },
      {
        id: 'img_traffic_stop_photo',
        name: 'Cruiser_Dashcam_Still_Stop.jpg',
        dataUrl: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="400" height="280" viewBox="0 0 400 280"><rect width="400" height="280" fill="%231e293b"/><path d="M 0 200 L 400 200 L 320 280 L 80 280 Z" fill="%23334155"/><line x1="200" y1="200" x2="200" y2="280" stroke="%23f59e0b" stroke-width="4" stroke-dasharray="10 10"/><rect x="150" y="170" width="100" height="45" fill="%233b82f6" rx="5"/><circle cx="170" cy="215" r="10" fill="%23000"/><circle cx="230" cy="215" r="10" fill="%23000"/><text x="15" y="30" font-family="sans-serif" font-size="12" fill="%23ef4444" font-weight="bold">WOBURN PD DASHCAM - CAM 02</text><text x="15" y="50" font-family="sans-serif" font-size="11" fill="%23f8fafc">2026-03-14 01:12:04 EST | MAIN ST &amp; LAKE AVE</text></svg>',
        sourceDocumentName: 'Cruiser_Dashcam_Video.mp4',
        pageNumber: 1,
        caption: 'Cruiser dashcam frame showing vehicle stopped on Main Street with emergency lights activated.',
        category: 'SCENE_PHOTO',
        selectedForReport: true,
        timestamp: '2026-03-14 01:12:04'
      }
    ],
    pleadingDrafts: [
      {
        id: 'draft_suppress_breath',
        type: 'MOTION',
        title: 'MOTION TO SUPPRESS BREATH TEST RESULTS (501 CMR 2.13 VIOLATION)',
        courtName: 'COMMONWEALTH OF MASSACHUSETTS, DISTRICT COURT DEPARTMENT, WOBURN DIVISION',
        docketNumber: 'DOCKET NO. 2656CR00142',
        clientName: 'Arthur Miller',
        defendantName: 'ARTHUR MILLER',
        prosecutorAgency: 'COMMONWEALTH OF MASSACHUSETTS',
        date: '2026-03-25',
        reliefRequested: 'The Defendant, Arthur Miller, respectfully moves this Honorable Court pursuant to Mass. R. Crim. P. 13 to suppress all breath test results obtained via the Draeger Alcotest 9510 on March 14, 2026.',
        statementOfFacts: 'On March 14, 2026, at approximately 01:15 hours, Woburn Police Officer Higgins initiated booking procedure for the Defendant. According to paragraph 2 of the police incident report, during the purported 15-minute observation window, Officer Higgins entered incident notes into his cruiser laptop computer and opened desktop drawers to retrieve booking forms, diverting his uninterrupted gaze from the Defendant.',
        legalArgument: 'Under 501 CMR 2.13 and Commonwealth v. Pierre, 72 Mass. App. Ct. 230 (2008), strict compliance with the 15-minute continuous observation period is a mandatory condition precedent to the admissibility of breath test evidence under M.G.L. c. 90 § 24K. The observing officer must maintain uninterrupted visual observation to guarantee the subject ingests no foreign substances, regurgitates, or belches. Interrupted observation invalidates the scientific reliability of the chemical test.',
        conclusion: 'WHEREFORE, the Defendant respectfully requests that this Honorable Court ALLOW this motion and order all breath test results suppressed from evidence.',
        statutoryCitations: ['M.G.L. c. 90 § 24K', '501 CMR 2.13', 'Commonwealth v. Pierre, 72 Mass. App. Ct. 230 (2008)'],
        signatureBlock: {
          attorneyName: 'Elena Rostova, Esq.',
          bboNumber: 'BBO #689123',
          firmName: 'Rostova Defense Group, P.C.',
          address: '100 Cambridge Street, Suite 1400, Boston, MA 02114',
          phone: '(617) 555-0199',
          email: 'erostova@rostovalaw.com'
        }
      }
    ],
    notes: [
      {
        id: 'note_1',
        authorRole: 'Lead Attorney',
        content: 'Crucial defect in observation window: officer typed notes on laptop and retrieved paperwork between 01:15 and 01:30. File 501 CMR 2.13 suppression motion immediately.',
        timestamp: new Date().toISOString(),
        resolved: false,
        pinnedRef: {
          documentId: 'doc_miller_report',
          documentName: 'Woburn_PD_Incident_Report_Miller.pdf',
          pageNumber: 2,
          paragraphNumber: 2,
          quoteSnippet: 'During the observation period, I entered incident notes on cruiser laptop computer and retrieved booking paperwork from the desktop drawer.'
        }
      }
    ],
    analysisResult: {
      caseSummary: 'Arthur Miller OUI Alcohol charge featuring 40-minute unmonitored incident-to-booking gap and 501 CMR 2.13 observation window interruption.',
      clientBackground: 'First-time OUI defense.',
      proceduralErrors: [],
      defensePillars: [
        { pillar: 'Observation & Timeline', score: 92, rationale: '40-min gap between stop and booking officer arrival' }
      ],
      motionWinScores: [],
      estimatedBACAtOperation: { min: 0.08, max: 0.12, calculationNotes: 'Retrograde extrapolation uncertainty' },
      timelineEvents: [
        { time: '01:10', event: 'Off. Higgins on patrol observed vehicle northbound on Main Street', documentRef: 'Woburn_PD_Incident_Report_Miller.pdf', pageParagraphRef: { pageNumber: 1, paragraphNumber: 1 } },
        { time: '01:12', event: 'Traffic stop initiated on Main Street; personal contact with Arthur Miller', documentRef: 'Woburn_PD_Incident_Report_Miller.pdf', pageParagraphRef: { pageNumber: 1, paragraphNumber: 2 } },
        { time: '01:17', event: 'Unlawful Exit Order issued based on odor of alcohol', documentRef: 'Woburn_PD_Incident_Report_Miller.pdf', pageParagraphRef: { pageNumber: 1, paragraphNumber: 3 } },
        { time: '01:20', event: 'Roadside SFST Walk and Turn test administered', documentRef: 'Woburn_PD_Incident_Report_Miller.pdf', pageParagraphRef: { pageNumber: 1, paragraphNumber: 4 } },
        { time: '01:24', event: 'Subject placed under arrest for OUI Alcohol and handcuffed', documentRef: 'Woburn_PD_Incident_Report_Miller.pdf', pageParagraphRef: { pageNumber: 2, paragraphNumber: 1 } },
        { time: '01:28', event: 'Cruiser transport initiated to Woburn Police Station', documentRef: 'Woburn_PD_Incident_Report_Miller.pdf', pageParagraphRef: { pageNumber: 2, paragraphNumber: 1 } },
        { time: '01:52', event: 'Arrival at Woburn PD station cellblock; Booking Officer intake initiated', documentRef: 'Woburn_PD_Incident_Report_Miller.pdf', pageParagraphRef: { pageNumber: 2, paragraphNumber: 1 } },
        { time: '01:55', event: 'Purported 15-Minute Observation window initiated (Officer typed on cruiser laptop during window)', documentRef: 'Woburn_PD_Incident_Report_Miller.pdf', pageParagraphRef: { pageNumber: 2, paragraphNumber: 2 } },
        { time: '02:10', event: 'Draeger Alcotest 9510 Breath Sample #1 recorded 0.092 g/210L', documentRef: 'Woburn_PD_Incident_Report_Miller.pdf', pageParagraphRef: { pageNumber: 2, paragraphNumber: 3 } },
        { time: '02:12', event: 'Draeger Alcotest 9510 Breath Sample #2 recorded 0.090 g/210L', documentRef: 'Woburn_PD_Incident_Report_Miller.pdf', pageParagraphRef: { pageNumber: 2, paragraphNumber: 3 } }
      ]
    }
  },
  {
    id: 'case_santos_worcester',
    clientName: 'Elena Santos',
    caseNumber: '2657CR00891',
    court: 'Worcester District Court (Worcester County)',
    charge: 'OUI Drugs (c. 90 § 24) & Possession Class B (c. 94C § 34)',
    incidentDate: '2026-02-18',
    arrestingAgency: 'Worcester Police Department',
    lastUpdated: new Date().toISOString(),
    documents: [
      {
        id: 'doc_santos_report',
        name: 'Worcester_PD_Incident_Report_Santos.pdf',
        type: 'police_report',
        uploadDate: '2026-02-19',
        status: 'parsed',
        parsedText: `[Page 1]
Paragraph 1: On February 18, 2026, Worcester Police conducted a traffic stop on Elm Street. Upon approach, the officer detected the odor of burnt marijuana.

Paragraph 2: Based on the odor of burnt marijuana, the officer issued an exit order for roadside sobriety testing.

Paragraph 3: Subject refused chemical breath testing at the station. The narrative notes: refusal demonstrated consciousness of guilt by refusing breath test.

Paragraph 4: A clear baggie of powder was seized and sent for lab testing. Certificate of analysis missing seal number and analyst signature with delay exceeding 45 days.`,
        pages: [
          {
            pageNumber: 1,
            paragraphs: [
              {
                paragraphNumber: 1,
                text: 'On February 18, 2026, Worcester Police conducted a traffic stop on Elm Street. Upon approach, the officer detected the odor of burnt marijuana.'
              },
              {
                paragraphNumber: 2,
                text: 'Based on the odor of burnt marijuana, the officer issued an exit order for roadside sobriety testing.'
              },
              {
                paragraphNumber: 3,
                text: 'Subject refused chemical breath testing at the station. The narrative notes: refusal demonstrated consciousness of guilt by refusing breath test.'
              },
              {
                paragraphNumber: 4,
                text: 'A clear baggie of powder was seized and sent for lab testing. Certificate of analysis missing seal number and analyst signature with delay exceeding 45 days.'
              }
            ]
          }
        ]
      }
    ],
    labResultData: {
      labCertificateId: 'UMASS-TOX-2026-0041',
      labName: 'UMass Forensic Toxicology Laboratory',
      analystName: 'G. M. Thorne, M.S.',
      sampleType: 'Blood',
      collectionTimestamp: '2026-02-18 23:45:00',
      labReceivedTimestamp: '2026-02-28 10:00:00',
      analysisTimestamp: '2026-04-05 16:00:00',
      chainOfCustodyDelayDays: 46,
      qcBatchNumber: 'BATCH-LCMS-1049',
      qcDeviationNotes: 'Certificate of Analysis lacks laboratory seal number and primary analyst electronic signature. Retention time drift noted on column #3.',
      chainOfCustodyGaps: [
        '10-day unaccounted delay between police evidence vault departure and lab receiving desk.',
        'Total analysis time exceeded 45-day statutory guideline under M.G.L. c. 22C § 39.'
      ],
      components: [
        {
          substance: 'Cocaine (Class B Controlled Substance)',
          detectedValue: 0.14,
          unit: 'mg/L',
          cutoffLevel: 0.05,
          therapeuticMin: 0.0,
          toxicMin: 0.20,
          uncertaintyRange: 0.03,
          testingMethod: 'GC-MS',
          qcBatchPassed: false
        },
        {
          substance: 'Benzoylecgonine (Cocaine Metabolite)',
          detectedValue: 0.85,
          unit: 'mg/L',
          cutoffLevel: 0.05,
          therapeuticMin: 0.0,
          toxicMin: 1.0,
          uncertaintyRange: 0.08,
          testingMethod: 'LC-MS/MS',
          qcBatchPassed: true
        }
      ]
    },
    extractedImages: [
      {
        id: 'img_santos_lab_cert',
        name: 'UMass_Toxicology_Certificate_Scan.png',
        dataUrl: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="400" height="280" viewBox="0 0 400 280"><rect width="400" height="280" fill="%23ffffff" stroke="%231e3a8a" stroke-width="4"/><text x="20" y="35" font-family="serif" font-size="14" font-weight="bold" fill="%231e3a8a">COMMONWEALTH OF MASSACHUSETTS</text><text x="20" y="55" font-family="sans-serif" font-size="12" fill="%23475569">DEPARTMENT OF STATE POLICE - FORENSIC LAB</text><line x1="20" y1="65" x2="380" y2="65" stroke="%23cbd5e1" stroke-width="2"/><text x="20" y="90" font-family="sans-serif" font-size="11" fill="%230f172a">CERTIFICATE OF ANALYSIS: %23UMASS-TOX-2026-0041</text><text x="20" y="110" font-family="sans-serif" font-size="11" fill="%230f172a">DEFENDANT: Elena Santos</text><text x="20" y="130" font-family="sans-serif" font-size="11" fill="%23b91c1c" font-weight="bold">CHAIN OF CUSTODY DELAY: 46 DAYS (STALE SAMPLE)</text><rect x="20" y="150" width="360" height="100" fill="%23f1f5f9" stroke="%23cbd5e1"/><text x="30" y="175" font-family="monospace" font-size="11" fill="%23334155">Substance 1: Cocaine (0.14 mg/L)</text><text x="30" y="195" font-family="monospace" font-size="11" fill="%23b91c1c" font-weight="bold">[DEFECT] Missing Analyst Official Seal</text><text x="30" y="215" font-family="monospace" font-size="11" fill="%23b91c1c" font-weight="bold">[DEFECT] Missing Chain of Custody Courier Receipt</text></svg>',
        sourceDocumentName: 'Worcester_PD_Incident_Report_Santos.pdf',
        pageNumber: 1,
        caption: 'State Forensic Lab Certificate showing 46-day analysis delay and missing official seal.',
        category: 'LAB_CERTIFICATE',
        selectedForReport: true,
        timestamp: '2026-04-05 16:00:00'
      }
    ],
    pleadingDrafts: [
      {
        id: 'draft_suppress_exit',
        type: 'MOTION',
        title: 'MOTION TO SUPPRESS EVIDENCE RESULTING FROM UNLAWFUL EXIT ORDER (CRUZ VIOLATION)',
        courtName: 'COMMONWEALTH OF MASSACHUSETTS, DISTRICT COURT DEPARTMENT, WORCESTER DIVISION',
        docketNumber: 'DOCKET NO. 2657CR00891',
        clientName: 'Elena Santos',
        defendantName: 'ELENA SANTOS',
        prosecutorAgency: 'COMMONWEALTH OF MASSACHUSETTS',
        date: '2026-03-01',
        reliefRequested: 'The Defendant, Elena Santos, respectfully moves this Court to suppress all evidence, observations, and lab certificates derived following the unlawful exit order issued on February 18, 2026.',
        statementOfFacts: 'On February 18, 2026, Worcester Police officers initiated a traffic stop on Elm Street. Upon stopping the vehicle, the officer detected the odor of burnt marijuana. Based solely upon this odor, the officer ordered Ms. Santos to exit her vehicle for field sobriety testing.',
        legalArgument: 'Under Commonwealth v. Cruz, 459 Mass. 459 (2011), the odor of burnt marijuana alone does not provide reasonable suspicion of criminal activity or operating under the influence under M.G.L. c. 94C § 32L to justify an exit order. Ordering a driver out of a vehicle without proportional safety or criminal suspicion violates Article 14 of the Massachusetts Declaration of Rights.',
        conclusion: 'WHEREFORE, the Defendant moves that this Court ALLOW the Motion to Suppress all fruits of the unlawful exit order.',
        statutoryCitations: ['Commonwealth v. Cruz, 459 Mass. 459 (2011)', 'Article 14, MA Declaration of Rights', 'M.G.L. c. 94C § 32L'],
        signatureBlock: {
          attorneyName: 'Elena Rostova, Esq.',
          bboNumber: 'BBO #689123',
          firmName: 'Rostova Defense Group, P.C.',
          address: '100 Cambridge Street, Suite 1400, Boston, MA 02114',
          phone: '(617) 555-0199',
          email: 'erostova@rostovalaw.com'
        }
      }
    ],
    notes: [
      {
        id: 'note_2',
        authorRole: 'Associate',
        content: 'Clear Cruz violation on exit order based solely on burnt marijuana odor, plus McGrail violation on refusal narrative.',
        timestamp: new Date().toISOString(),
        resolved: false
      }
    ]
  }
];
