import { ProceduralError, LabResultData } from '../types';

export function labDiscoveryRequests(labErrors: ProceduralError[]): string[] {
  if (!labErrors || labErrors.length === 0) return [];

  const requests: string[] = [];

  const hasSpansCutoff = labErrors.some((e) => e.id.startsWith('lab_spans_cutoff_'));
  const hasQcFailure = labErrors.some((e) => e.id === 'lab_qc_batch_failure');
  const hasCustodyDelay = labErrors.some((e) => e.id === 'lab_custody_delay');
  const hasHypergeometric = labErrors.some((e) => e.id.includes('hypergeometric'));
  const hasFTIR = labErrors.some((e) => e.id.includes('ftir'));
  const hasNetWeight = labErrors.some((e) => e.id.includes('net_weight'));
  const hasSyringe = labErrors.some((e) => e.id.includes('syringe'));
  const hasPackaging = labErrors.some((e) => e.id.includes('packaging'));
  const hasOUITox = labErrors.some((e) => e.id.includes('oui_blood') || e.id.includes('urine_ethanol'));

  if (hasSpansCutoff) {
    requests.push('Measurement uncertainty budget, standard deviation calculations, and coverage factor (k=2 or k=3) for all quantitative analytes.');
  }
  if (hasQcFailure) {
    requests.push('Control charts, batch calibration curves, blank runs, and corrective action logs for the analytical batch.');
  }
  if (hasCustodyDelay) {
    requests.push('Evidence vault temperature logs, refrigeration records, and complete chain-of-custody transfer records.');
  }
  if (hasHypergeometric) {
    requests.push('Complete Seized Drug bench worksheets, individual item physical inspection logs (size, color, markings), Marquis color test bench notes, and k-factor sampling decision rule documentation.');
  }
  if (hasFTIR) {
    requests.push('Raw FTIR spectra, background blank spectrum immediately preceding sample run, library comparison match scores, and confirmatory GC-MS total ion chromatograms and mass spectra.');
  }
  if (hasNetWeight) {
    requests.push('Analytical balance calibration logs, daily balance check records, tare weight logs, and expanded weight uncertainty budget calculations.');
  }
  if (hasSyringe) {
    requests.push('Written Director / Deputy Director approval authorization for hypodermic syringe submission under MSPCL Item Analysis Policy § 2.5.1.');
  }
  if (hasPackaging) {
    requests.push('Case Management Unit (CMU) approval authorization and Section Manager approval notes for drug packaging processing under MSPCL Policy § 2.4.');
  }
  if (hasOUITox) {
    requests.push('Both initial ethanol toxicology report and supplemental drug testing report, whole blood vs serum conversion logs, and GC-FID/LC-MS chromatograms.');
  }

  requests.push('Analyst curriculum vitae, method authorizations, proficiency test history, and task-irrelevant context sheets provided to the analyst prior to testing.');
  requests.push('Full standard operating procedure (SOP) for the Drug / Toxicology Unit as it existed on the date of analysis.');
  requests.push('Instrument calibration, tuning logs, and maintenance records covering 30 days prior to and after the analysis date.');

  return Array.from(new Set(requests));
}

export function generateLabProceduralErrors(labData?: LabResultData): ProceduralError[] {
  if (!labData) return [];

  const labErrors: ProceduralError[] = [];

  // 1. Spans cutoff error
  if (labData.components) {
    labData.components.forEach((c, idx) => {
      const minBound = c.detectedValue - c.uncertaintyRange;
      const cutoff = c.unit === 'g/100mL' || c.substance.toLowerCase().includes('ethanol') ? 0.080 : c.cutoffLevel;
      
      if (minBound < cutoff && c.detectedValue >= cutoff) {
        labErrors.push({
          id: `lab_spans_cutoff_${idx}`,
          category: 'Lab Analysis',
          severity: 'HIGH',
          title: `${c.substance} Spans Statutory Cutoff Once Uncertainty Applied`,
          description: `The reported ${c.substance} of ${c.detectedValue} ${c.unit} spans the ${cutoff} ${c.unit} cutoff once the laboratory's stated measurement uncertainty (±${c.uncertaintyRange}) is applied (true lower bound ${minBound.toFixed(3)} ${c.unit}). The quantitative result cannot establish guilt beyond a reasonable doubt.`,
          verbatimQuote: '',
          pageParagraphRef: {
            documentId: labData.labCertificateId,
            documentName: 'Toxicology Certificate of Analysis'
          },
          standardViolated: 'Scientific Reliability & Reasonable Doubt Standard',
          evidentiaryExclusionStrategy: "Move to exclude or limit quantitative result; cross-examine analyst on expanded measurement uncertainty budget and coverage factor.",
          sourceLayer: 'RULE_ENGINE',
          verifiedQuote: false,
          verificationStatus: 'DERIVED_FINDING'
        });
      }
    });
  }

  // 2. QC Batch failure error
  if (labData.qcBatchNumber) {
    const failedComponent = labData.components?.find((c) => !c.qcBatchPassed);
    if (failedComponent || (labData.qcDeviationNotes && labData.qcDeviationNotes.toLowerCase().includes('drift'))) {
      labErrors.push({
        id: 'lab_qc_batch_failure',
        category: 'Lab Analysis',
        severity: 'CRITICAL',
        title: 'Analytical Quality Control Failure for Batch',
        description: `The Certificate indicates QC batch ${labData.qcBatchNumber} exhibited calibrator drift or failed quality control checks. Noted deviation: ${labData.qcDeviationNotes || 'Control drift outside acceptable tolerances.'}`,
        verbatimQuote: '',
        pageParagraphRef: {
          documentId: labData.labCertificateId,
          documentName: 'Toxicology Certificate of Analysis'
        },
        standardViolated: 'ISO/IEC 17025 Forensic Laboratory Quality Control Standards',
        evidentiaryExclusionStrategy: 'Move to exclude laboratory results. Request control charts, batch calibration curves, and corrective action reports.',
        sourceLayer: 'RULE_ENGINE',
        verifiedQuote: false,
        verificationStatus: 'DERIVED_FINDING'
      });
    }
  }

  // 3. Chain of custody delay error
  if (labData.chainOfCustodyDelayDays && labData.chainOfCustodyDelayDays > 30) {
    labErrors.push({
      id: 'lab_custody_delay',
      category: 'Lab Analysis',
      severity: 'MEDIUM',
      title: `Excessive Chain of Custody Delay (${labData.chainOfCustodyDelayDays} Days)`,
      description: `A delay of ${labData.chainOfCustodyDelayDays} days occurred between sample collection and laboratory analysis, creating risk of sample degradation or volatile analyte loss.`,
      verbatimQuote: '',
      pageParagraphRef: {
        documentId: labData.labCertificateId,
        documentName: 'Toxicology Certificate of Analysis'
      },
      standardViolated: 'M.G.L. c. 22C § 39 & Evidence Integrity Protocols',
      evidentiaryExclusionStrategy: 'Request storage temperature logs for the full interval; cross-examine analyst on analyte stability during storage delays.',
      sourceLayer: 'RULE_ENGINE',
      verifiedQuote: false,
      verificationStatus: 'DERIVED_FINDING'
    });
  }

  // 4. Seized Drug Hypergeometric Sampling Non-Homogeneity Breach
  if (labData.isSeizedDrugCase && labData.drugSeizureItems) {
    labData.drugSeizureItems.forEach((item, idx) => {
      if (
        item.samplingPlanUsed.startsWith('Hypergeometric') &&
        (!item.homogeneityVerified || !item.colorTestIdentical)
      ) {
        labErrors.push({
          id: `lab_drug_hypergeometric_homogeneity_breach_${idx}`,
          category: 'Lab Analysis',
          severity: 'CRITICAL',
          title: `Non-Homogeneous Seizure Invalidates Hypergeometric Sampling Inference`,
          description: `The Drug Unit applied Hypergeometric sampling (${item.samplingPlanUsed}) to test ${item.testedItemCount} of ${item.totalItemCount} items in ${item.itemDescription}, but bench notes indicate non-identical physical appearance or divergent preliminary color test results (${item.colorTestDetails || 'Color test reaction varied across units'}). Under MSPCL SOP § 4.10.10.1 and Forensic Services Notice, any non-homogeneity voids Hypergeometric sampling and prohibits extrapolating drug identity or weight to untested bags.`,
          verbatimQuote: item.colorTestDetails || '',
          pageParagraphRef: {
            documentId: labData.labCertificateId,
            documentName: 'Certificate of Drug Analysis'
          },
          standardViolated: 'MSPCL Administrative Procedure for Sampling § 4.10.10.1 & Hypergeometric Notice (June 10, 2026)',
          evidentiaryExclusionStrategy: 'Move to suppress statistical extrapolation over untested items. Limit proof of drug identity and net weight exclusively to the units actually tested.',
          sourceLayer: 'RULE_ENGINE',
          verifiedQuote: false,
          verificationStatus: 'DERIVED_FINDING'
        });
      }

      // 5. Net Weight Uncertainty Threshold Breach
      if (
        item.statutoryThresholdGrams &&
        item.reportedNetWeightGrams &&
        item.weightUncertaintyGrams
      ) {
        const lowerWeightBound = item.reportedNetWeightGrams - item.weightUncertaintyGrams;
        if (lowerWeightBound < item.statutoryThresholdGrams && item.reportedNetWeightGrams >= item.statutoryThresholdGrams) {
          labErrors.push({
            id: `lab_drug_net_weight_uncertainty_threshold_${idx}`,
            category: 'Lab Analysis',
            severity: 'HIGH',
            title: `Net Weight Stated Uncertainty Spans Statutory Trafficking Threshold`,
            description: `Reported net weight of ${item.reportedNetWeightGrams}g spans the ${item.statutoryThresholdGrams}g statutory threshold once expanded balance uncertainty (±${item.weightUncertaintyGrams}g) is applied (true lower bound ${lowerWeightBound.toFixed(3)}g). The Commonwealth cannot prove the threshold weight was met beyond a reasonable doubt.`,
            verbatimQuote: '',
            pageParagraphRef: {
              documentId: labData.labCertificateId,
              documentName: 'Certificate of Drug Analysis'
            },
            standardViolated: 'M.G.L. c. 94C § 32E & ISO/IEC 17025 Measurement Uncertainty Standards',
            evidentiaryExclusionStrategy: 'Move to dismiss trafficking count or reduce charge to lower weight tier; cross-examine analyst on analytical balance uncertainty budget.',
            sourceLayer: 'RULE_ENGINE',
            verifiedQuote: false,
            verificationStatus: 'DERIVED_FINDING'
          });
        }
      }

      // 6. FTIR Method Limitations for Street Drug Mixture / Optical Isomers
      if (
        item.primaryMethod === 'FTIR' &&
        !item.confirmatoryGCMSDone &&
        (item.isStreetDrugMixture || item.suspectedOpticalIsomers)
      ) {
        labErrors.push({
          id: `lab_drug_ftir_limitation_${idx}`,
          category: 'Lab Analysis',
          severity: 'HIGH',
          title: `Unconfirmed FTIR Analysis Unreliable for Street Drug Mixture / Optical Isomers`,
          description: `Identification of ${item.itemDescription} relied primarily on FTIR spectroscopy without confirmatory GC-MS. FTIR is scientifically inadequate to distinguish optical isomers (e.g., L-methamphetamine in OTC inhalers vs D-methamphetamine) and cannot produce reliable spectra on impure street drug mixtures (<90% purity) without chromatographic separation.`,
          verbatimQuote: '',
          pageParagraphRef: {
            documentId: labData.labCertificateId,
            documentName: 'Certificate of Drug Analysis'
          },
          standardViolated: 'Mass. R. Evid. 702 Scientific Reliability & SWGDRUG Category A Guidelines',
          evidentiaryExclusionStrategy: 'File Motion to Exclude FTIR identification under Mass. R. Evid. 702 / Daubert-Lanigan standard. Cross-examine on FTIR mixture subtraction limits and optical isomer non-distinction.',
          sourceLayer: 'RULE_ENGINE',
          verifiedQuote: false,
          verificationStatus: 'DERIVED_FINDING'
        });
      }
    });
  }

  // 7. MSPCL Policy Violation: Hypodermic Syringe Intake
  if (labData.drugPolicyAudits?.containsSyringe && !labData.drugPolicyAudits?.syringeHasHomicideApproval) {
    labErrors.push({
      id: 'lab_drug_policy_syringe_violation',
      category: 'Lab Analysis',
      severity: 'HIGH',
      title: 'Hypodermic Syringe Accepted & Tested Without Mandatory Director Authorization',
      description: 'The laboratory accepted and analyzed hypodermic syringe evidence. Under MSPCL Item Analysis Policy ID: 4163 Rev 6 § 2.5.1, hypodermic syringes and expressed contents are strictly rejected unless prior written approval is granted by the Director/Deputy Director in homicide investigations with no other available evidence.',
      verbatimQuote: '',
      pageParagraphRef: {
        documentId: labData.labCertificateId,
        documentName: 'Certificate of Drug Analysis'
      },
      standardViolated: 'MSPCL Item Analysis Policy ID: 4163 Rev 6 § 2.5.1',
      evidentiaryExclusionStrategy: 'Move to exclude syringe test results for non-compliance with mandatory state crime laboratory intake policy.',
      sourceLayer: 'RULE_ENGINE',
      verifiedQuote: false,
      verificationStatus: 'DERIVED_FINDING'
    });
  }

  // 8. MSPCL Policy Violation: Packaging Processing
  if (
    labData.drugPolicyAudits?.drugPackagingDNAOrPrintRequested &&
    (labData.drugPolicyAudits?.isPossessionOnlyCharge ||
      (labData.drugPolicyAudits?.isInteriorPackagingProcessed && !labData.drugPolicyAudits?.interiorPackagingApprovedByDirector))
  ) {
    labErrors.push({
      id: 'lab_drug_policy_packaging_violation',
      category: 'Lab Analysis',
      severity: 'MEDIUM',
      title: 'Unauthorized Latent Print / DNA Processing of Drug Packaging Evidence',
      description: 'Laboratory processed drug packaging for DNA or latent fingerprints. MSPCL Item Analysis Policy § 2.4.1 strictly prohibits DNA/print processing of drug packaging in possession-only cases, and § 2.4.4 forbids interior packaging processing without documented Deputy Director / Section Manager approval.',
      verbatimQuote: '',
      pageParagraphRef: {
        documentId: labData.labCertificateId,
        documentName: 'Evidence Intake & Analysis Log'
      },
      standardViolated: 'MSPCL Item Analysis Policy ID: 4163 Rev 6 § 2.4.1 & 2.4.4',
      evidentiaryExclusionStrategy: 'Move to suppress DNA and latent fingerprint evidence recovered from drug packaging.',
      sourceLayer: 'RULE_ENGINE',
      verifiedQuote: false,
      verificationStatus: 'DERIVED_FINDING'
    });
  }

  // 9. MSPCL Policy Violation: Found Items / CI Buys
  if (labData.drugPolicyAudits?.isFoundItemOrCIBuy) {
    labErrors.push({
      id: 'lab_drug_policy_ci_buy_found_item',
      category: 'Lab Analysis',
      severity: 'HIGH',
      title: 'Testing Conducted on Prohibited Found Item or CI Buy Evidence',
      description: 'The laboratory performed analysis on evidence originating from a Confidential Informant buy or found item. MSPCL Item Analysis Policy § 5.1.1 strictly mandates that cases containing found items or CI buys shall not be analyzed by the Drug Unit.',
      verbatimQuote: '',
      pageParagraphRef: {
        documentId: labData.labCertificateId,
        documentName: 'Certificate of Drug Analysis'
      },
      standardViolated: 'MSPCL Item Analysis Policy ID: 4163 Rev 6 § 5.1.1.1 & 5.1.1.2',
      evidentiaryExclusionStrategy: 'Move to exclude drug certificates issued in violation of mandatory laboratory case intake prohibitions.',
      sourceLayer: 'RULE_ENGINE',
      verifiedQuote: false,
      verificationStatus: 'DERIVED_FINDING'
    });
  }

  // 10. OUI Blood Dual Testing Workflow Violation
  if (
    labData.ouiToxicologyAudits?.isOUIBloodDraw &&
    labData.ouiToxicologyAudits?.testedEthanol &&
    !labData.ouiToxicologyAudits?.testedDrugs &&
    !labData.ouiToxicologyAudits?.issuedDualSupplementalReport
  ) {
    labErrors.push({
      id: 'lab_tox_oui_blood_dual_testing_breach',
      category: 'Lab Analysis',
      severity: 'MEDIUM',
      title: 'OUI Blood Evidence Missing Mandatory Supplemental Drug Screening Report',
      description: 'An OUI blood sample was tested for ethanol only without issuing a supplemental drug analysis report. Effective February 19, 2026, MSPCL Toxicology Unit guidelines mandate that ALL blood evidence submitted for OUI analysis MUST be tested for BOTH ethanol and drugs, regardless of the detected alcohol concentration.',
      verbatimQuote: '',
      pageParagraphRef: {
        documentId: labData.labCertificateId,
        documentName: 'Toxicology Certificate of Analysis'
      },
      standardViolated: 'MSPCL Toxicology Unit Notice: Expansion of Testing for OUI Blood Samples (Feb 19, 2026)',
      evidentiaryExclusionStrategy: 'Request production of complete supplemental drug toxicology testing files and raw chromatographic data.',
      sourceLayer: 'RULE_ENGINE',
      verifiedQuote: false,
      verificationStatus: 'DERIVED_FINDING'
    });
  }

  // 11. OUI Urine Alcohol Testing Prohibition Violation
  if (labData.ouiToxicologyAudits?.isUrineSampleForOUI && labData.ouiToxicologyAudits?.attemptedUrineEthanol) {
    labErrors.push({
      id: 'lab_tox_oui_urine_ethanol_prohibition',
      category: 'Lab Analysis',
      severity: 'HIGH',
      title: 'Prohibited Ethanol Analysis Attempted on OUI Urine Specimen',
      description: 'The laboratory attempted alcohol concentration analysis on an OUI urine specimen. Under MSPCL Item Analysis Policy § 6.1.3, OUI cases containing only urine specimens shall be evaluated for drugs ONLY; alcohol analysis is explicitly prohibited.',
      verbatimQuote: '',
      pageParagraphRef: {
        documentId: labData.labCertificateId,
        documentName: 'Toxicology Certificate of Analysis'
      },
      standardViolated: 'MSPCL Item Analysis Policy ID: 4163 Rev 6 § 6.1.3',
      evidentiaryExclusionStrategy: 'Move to suppress urine alcohol calculations and any retrograde extrapolation derived from urine alcohol values.',
      sourceLayer: 'RULE_ENGINE',
      verifiedQuote: false,
      verificationStatus: 'DERIVED_FINDING'
    });
  }

  // 12. Cognitive Bias Exposure Defect
  if (labData.drugPolicyAudits?.analystReceivedSuspectContext) {
    labErrors.push({
      id: 'lab_drug_cognitive_bias_risk',
      category: 'Lab Analysis',
      severity: 'LOW',
      title: 'Forensic Analyst Exposed to Task-Irrelevant Cognitive Bias Factors',
      description: 'Case documentation reveals the forensic analyst was provided with task-irrelevant context (suspect demographics, law enforcement conclusions regarding substance identity) prior to testing. Peer-reviewed research (Dror et al.) demonstrates that task-irrelevant context biases forensic decision-making and test selection.',
      verbatimQuote: '',
      pageParagraphRef: {
        documentId: labData.labCertificateId,
        documentName: 'Evidence Submission Form'
      },
      standardViolated: 'Forensic Science Task-Irrelevant Information Minimization Standards',
      evidentiaryExclusionStrategy: 'Cross-examine analyst on cognitive bias and failure to perform blind analysis.',
      sourceLayer: 'RULE_ENGINE',
      verifiedQuote: false,
      verificationStatus: 'DERIVED_FINDING'
    });
  }

  return labErrors;
}
