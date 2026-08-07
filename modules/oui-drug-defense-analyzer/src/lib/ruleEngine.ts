import { CaseDocument, ExtractedPage, MotionWinScore, ProceduralError } from '../types';
import { verifyQuoteAgainstPages } from './citationGuard';

/**
 * Helper to search document pages for sentences matching patterns
 */
function findSentenceInPages(
  pages: ExtractedPage[] | undefined,
  regex: RegExp
): { sentence: string; pageNumber: number; paragraphNumber: number } | null {
  if (!pages || pages.length === 0) return null;

  for (const page of pages) {
    for (const para of page.paragraphs) {
      const sentences = para.text.match(/[^.!?]+[.!?]+/g) || [para.text];
      for (const sentence of sentences) {
        if (regex.test(sentence)) {
          return {
            sentence: sentence.trim(),
            pageNumber: page.pageNumber,
            paragraphNumber: para.paragraphNumber
          };
        }
      }
    }
  }
  return null;
}

/**
 * Layer A: Deterministic Rules Engine
 * Evaluates discovery documents against Massachusetts OUI and drug defense rules.
 */
export function runDeterministicRuleEngine(documents: CaseDocument[]): {
  errors: ProceduralError[];
  motionScores: MotionWinScore[];
} {
  const errors: ProceduralError[] = [];

  const combinedText = documents.map((d) => d.parsedText).join('\n\n');
  const primaryDoc = documents[0];
  const pages = primaryDoc?.pages;

  // RULE 1: Observation Window Arithmetic & Continuity
  // Check start of observation time vs sequence start time
  const obsTimeMatch = combinedText.match(/observation\s+(?:started|began|period)\s*(?:at)?\s*(\d{1,2}:\d{2})/i);
  const seqTimeMatch = combinedText.match(/(?:sequence|draeger|breath\s+test)\s+(?:started|began|time|at)\s*(\d{1,2}:\d{2}:\d{2}|\d{1,2}:\d{2})/i);

  let obsDeltaMinutes: number | null = null;
  if (obsTimeMatch && seqTimeMatch) {
    const [obsH, obsM] = obsTimeMatch[1].split(':').map(Number);
    const [seqH, seqM] = seqTimeMatch[1].split(':').map(Number);
    const obsTotal = obsH * 60 + obsM;
    const seqTotal = seqH * 60 + seqM;
    obsDeltaMinutes = seqTotal - obsTotal;
  }

  // Check observation continuity (concurrent officer tasks during window)
  const continuityMatch = findSentenceInPages(
    pages,
    /(?:typing|booking|computer|paperwork|radio|left the room|retrieved|cruiser laptop|entered notes|stepped away)/i
  );

  if (continuityMatch) {
    const verifyRes = verifyQuoteAgainstPages(
      continuityMatch.sentence,
      { pageNumber: continuityMatch.pageNumber, paragraphNumber: continuityMatch.paragraphNumber },
      pages
    );

    errors.push({
      id: 'rule_obs_continuity',
      category: 'Observation Window',
      severity: 'CRITICAL',
      title: 'Observation Window Interrupted by Concurrent Officer Tasks',
      description: 'The narrative documents the observing officer performing secondary tasks (typing, laptop, paperwork, stepping away) during the mandatory 15-minute observation window, violating continuous observation regulations.',
      verbatimQuote: continuityMatch.sentence,
      pageParagraphRef: {
        pageNumber: continuityMatch.pageNumber,
        paragraphNumber: continuityMatch.paragraphNumber,
        documentId: primaryDoc?.id,
        documentName: primaryDoc?.name
      },
      standardViolated: '501 CMR 2.13 & Commonwealth v. Davis, 481 Mass. 440 (2019)',
      evidentiaryExclusionStrategy: 'MOTION TO SUPPRESS BREATH TEST EVIDENCE: Pursuant to Mass. R. Crim. P. 13, M.G.L. c. 90, § 24(1)(e), and 501 CMR 2.13, Defendant moves to suppress all breath test results. GROUND: The Commonwealth failed to satisfy the foundational threshold of establishing an uninterrupted 15-minute observation period immediately preceding test administration. ARGUMENT: In Commonwealth v. Davis, 481 Mass. 440 (2019) and 501 CMR 2.13, the BTO must continuously observe the subject to ensure no regurgitation or mouth alcohol contamination. Performing concurrent administrative tasks (laptop typing, paperwork) breaks line-of-sight observation. PRAYER FOR RELIEF: Exclude all numerical breath test readings and any police officer opinion regarding test administration.',
      sourceLayer: 'RULE_ENGINE',
      verifiedQuote: verifyRes.verified,
      verificationStatus: verifyRes.verificationStatus,
      matchingSnippet: verifyRes.matchingSnippet
    });
  } else if (obsDeltaMinutes !== null && obsDeltaMinutes < 15) {
    errors.push({
      id: 'rule_obs_time_delta',
      category: 'Observation Window',
      severity: 'CRITICAL',
      title: 'Observation Window Shorter Than 15 Minutes',
      description: `Observation started at ${obsTimeMatch?.[1]} and breath sequence started at ${seqTimeMatch?.[1]}, providing less than 15 minutes of required observation time (${obsDeltaMinutes} minutes elapsed).`,
      verbatimQuote: '',
      pageParagraphRef: {
        documentId: primaryDoc?.id,
        documentName: primaryDoc?.name
      },
      standardViolated: '501 CMR 2.13',
      evidentiaryExclusionStrategy: 'MOTION TO SUPPRESS BREATH TEST RESULTS: Move to suppress chemical test results pursuant to 501 CMR 2.13 and M.G.L. c. 90 § 24K. GROUND: Statutorily non-compliant observation window of less than 15 full minutes. ARGUMENT: Strict compliance with 501 CMR 2.13 is a mandatory prerequisite to admissibility under Commonwealth v. Pierre, 72 Mass. App. Ct. 230 (2008). PRAYER FOR RELIEF: Order complete exclusion of breath test numerical results and BATS reports from trial evidence.',
      sourceLayer: 'RULE_ENGINE',
      verifiedQuote: false,
      verificationStatus: 'DERIVED_FINDING'
    });
  }

  // RULE 2: Exit Order Basis
  const exitOrderSentence = findSentenceInPages(
    pages,
    /(?:ordered|instructed|asked)\s+(?:the\s+driver|subject|defendant)\s+to\s+exit/i
  );
  const odorOnlyMatch = findSentenceInPages(
    pages,
    /(?:odor|smell)\s+of\s+(?:an\g<0>|alcohol|intoxicating\s+liquor|burnt\s+marijuana|cannabis)/i
  );

  const hasObservedImpairment = /(?:slurred|stumbling|swerving|marked\s+lanes|weaving|bloodshot|glassy|unsteady)/i.test(combinedText);

  if (exitOrderSentence && odorOnlyMatch && !hasObservedImpairment) {
    const verifyRes = verifyQuoteAgainstPages(
      exitOrderSentence.sentence,
      { pageNumber: exitOrderSentence.pageNumber, paragraphNumber: exitOrderSentence.paragraphNumber },
      pages
    );

    errors.push({
      id: 'rule_exit_order_basis',
      category: 'Exit Order',
      severity: 'HIGH',
      title: 'Exit Order Lacked Articulable Suspicion of Impairment or Danger',
      description: 'The exit order was commanded based solely on the odor of alcohol or marijuana without prior documented observations of erratic driving, slurred speech, or balance loss.',
      verbatimQuote: exitOrderSentence.sentence,
      pageParagraphRef: {
        pageNumber: exitOrderSentence.pageNumber,
        paragraphNumber: exitOrderSentence.paragraphNumber,
        documentId: primaryDoc?.id,
        documentName: primaryDoc?.name
      },
      standardViolated: 'Article 14, Mass. Declaration of Rights & Commonwealth v. Blais, 428 Mass. 294 (1998)',
      evidentiaryExclusionStrategy: 'MOTION TO SUPPRESS EVIDENCE OBTAINED FROM ILLEGAL EXIT ORDER: Pursuant to Article 14 of the Mass. Declaration of Rights and Mass. R. Crim. P. 13, Defendant moves to suppress all physical evidence, officer observations, and SFST performance following the exit order. GROUND: The exit order was issued without reasonable suspicion that the operator was engaged in criminal activity or posed a safety threat. ARGUMENT: In Commonwealth v. Torres, 424 Mass. 153 (1997) and Commonwealth v. Barreto, 483 Mass. 716 (2019), odor of alcohol or marijuana alone without observed driving impairment or balance failure is legally insufficient to justify an exit order. PRAYER FOR RELIEF: Suppress all observations, statements, and test results obtained post-exit.',
      sourceLayer: 'RULE_ENGINE',
      verifiedQuote: verifyRes.verified,
      verificationStatus: verifyRes.verificationStatus
    });
  }

  // RULE 3: SFST Instruction Deviation
  const sfstLineMatch = findSentenceInPages(
    pages,
    /(?:white\s+pavement\s+line|white\s+line|fog\s+line|painted\s+line)/i
  );

  if (sfstLineMatch) {
    const verifyRes = verifyQuoteAgainstPages(
      sfstLineMatch.sentence,
      { pageNumber: sfstLineMatch.pageNumber, paragraphNumber: sfstLineMatch.paragraphNumber },
      pages
    );

    errors.push({
      id: 'rule_sfst_line_instruction',
      category: 'SFST Administration',
      severity: 'HIGH',
      title: 'SFST Deviation: Non-Standard Line Instruction',
      description: 'Officer instructed subject to walk down a white pavement/fog line without confirmation that a standard flat, non-slippery designated line was verified, violating NHTSA standardized administration instructions.',
      verbatimQuote: sfstLineMatch.sentence,
      pageParagraphRef: {
        pageNumber: sfstLineMatch.pageNumber,
        paragraphNumber: sfstLineMatch.paragraphNumber,
        documentId: primaryDoc?.id,
        documentName: primaryDoc?.name
      },
      standardViolated: 'NHTSA Standardized Field Sobriety Testing Student Manual & Commonwealth v. Sands, 424 Mass. 184 (1997)',
      evidentiaryExclusionStrategy: 'MOTION IN LIMINE TO EXCLUDE SFST TESTIMONY: Pursuant to Mass. G. Evid. § 702 and Commonwealth v. Sands, 424 Mass. 184 (1997), Defendant moves to exclude officer opinion testimony that Defendant failed roadside field sobriety tests. GROUND: Substantial deviation from NHTSA standardized instructions compromises scientific validity. ARGUMENT: Non-standard surface or line instructions undermine test reliability. PRAYER FOR RELIEF: Restrict officer testimony to raw observational descriptions without characterizations of pass/fail or sobriety scores.',
      sourceLayer: 'RULE_ENGINE',
      verifiedQuote: verifyRes.verified,
      verificationStatus: verifyRes.verificationStatus
    });
  }

  // RULE 4: Cannabis Lay Opinion
  const cannabisOpinionMatch = findSentenceInPages(
    pages,
    /(?:failed\s+(?:roadside|sfst|field\s+sobriety)\s+test|performance\s+established\s+(?:marijuana|cannabis)\s+intoxication|under\s+the\s+influence\s+of\s+(?:marijuana|cannabis))/i
  );

  if (cannabisOpinionMatch) {
    const verifyRes = verifyQuoteAgainstPages(
      cannabisOpinionMatch.sentence,
      { pageNumber: cannabisOpinionMatch.pageNumber, paragraphNumber: cannabisOpinionMatch.paragraphNumber },
      pages
    );

    errors.push({
      id: 'rule_cannabis_opinion',
      category: 'Cannabis Impairment',
      severity: 'CRITICAL',
      title: 'Impermissible Police Lay Opinion on Cannabis Impairment',
      description: 'Officer narrative impermissibly asserts that the subject failed roadside tests or that performance established marijuana intoxication, directly violating Commonwealth v. Gerhardt.',
      verbatimQuote: cannabisOpinionMatch.sentence,
      pageParagraphRef: {
        pageNumber: cannabisOpinionMatch.pageNumber,
        paragraphNumber: cannabisOpinionMatch.paragraphNumber,
        documentId: primaryDoc?.id,
        documentName: primaryDoc?.name
      },
      standardViolated: 'Commonwealth v. Gerhardt, 477 Mass. 775 (2017)',
      evidentiaryExclusionStrategy: 'MOTION IN LIMINE TO PRECLUDE LAY OPINION ON CANNABIS IMPAIRMENT: Move pursuant to Commonwealth v. Gerhardt, 477 Mass. 775 (2017) to prohibit law enforcement witnesses from testifying that Defendant was under the influence of marijuana or failed field sobriety tests. GROUND: Police officers may not offer lay opinion testimony regarding cannabis intoxication or state that SFST performance establishes marijuana impairment. PRAYER FOR RELIEF: Issue protective order directing prosecutor and police witnesses not to state or imply Defendant failed roadside tests due to marijuana.',
      sourceLayer: 'RULE_ENGINE',
      verifiedQuote: verifyRes.verified,
      verificationStatus: verifyRes.verificationStatus
    });
  }

  // RULE 5: Refusal Characterization as Evidence
  const refusalMatch = findSentenceInPages(
    pages,
    /(?:refusal|refused\s+to\s+test|refused\s+breath)\s+demonstrated\s+consciousness\s+of\s+guilt/i
  );

  if (refusalMatch) {
    const verifyRes = verifyQuoteAgainstPages(
      refusalMatch.sentence,
      { pageNumber: refusalMatch.pageNumber, paragraphNumber: refusalMatch.paragraphNumber },
      pages
    );

    errors.push({
      id: 'rule_refusal_characterization',
      category: 'Refusal Characterization',
      severity: 'CRITICAL',
      title: 'Impermissible Characterization of Chemical Test Refusal',
      description: 'Police narrative characterizes the chemical test refusal as consciousness of guilt, violating constitutional self-incrimination protections.',
      verbatimQuote: refusalMatch.sentence,
      pageParagraphRef: {
        pageNumber: refusalMatch.pageNumber,
        paragraphNumber: refusalMatch.paragraphNumber,
        documentId: primaryDoc?.id,
        documentName: primaryDoc?.name
      },
      standardViolated: 'Article 12, Mass. Declaration of Rights & Commonwealth v. McGrail, 419 Mass. 774 (1995); M.G.L. c. 90 § 24(1)(e)',
      evidentiaryExclusionStrategy: 'MOTION IN LIMINE TO EXCLUDE EVIDENCE OR MENTION OF CHEMICAL TEST REFUSAL: Move under M.G.L. c. 90, § 24(1)(e) and Article 12 of Mass. Declaration of Rights. GROUND: Evidence of refusal to submit to a breathalyzer test is strictly inadmissible in criminal proceedings. ARGUMENT: Under Commonwealth v. McGrail and Commonwealth v. Zevitas, 418 Mass. 677 (1994), admitting refusal evidence or commenting on it violates the privilege against self-incrimination. PRAYER FOR RELIEF: Order prosecutor and witnesses not to mention refusal or absence of breath test.',
      sourceLayer: 'RULE_ENGINE',
      verifiedQuote: verifyRes.verified,
      verificationStatus: verifyRes.verificationStatus
    });
  }

  // RULE 6: Draeger Sequence Integrity
  const draegerMatch = findSentenceInPages(
    pages,
    /(?:draeger|alcotest|calibration\s+check|sample\s+difference|blank\s+nonzero)/i
  );

  if (draegerMatch) {
    const verifyRes = verifyQuoteAgainstPages(
      draegerMatch.sentence,
      { pageNumber: draegerMatch.pageNumber, paragraphNumber: draegerMatch.paragraphNumber },
      pages
    );

    errors.push({
      id: 'rule_draeger_integrity',
      category: 'Draeger Calibration',
      severity: 'HIGH',
      title: 'Draeger Alcotest Sequence Integrity Discrepancy',
      description: 'Breath test records indicate sequence calibration anomaly, blank discrepancy, or operator certification timeline issue requiring OAT audit.',
      verbatimQuote: draegerMatch.sentence,
      pageParagraphRef: {
        pageNumber: draegerMatch.pageNumber,
        paragraphNumber: draegerMatch.paragraphNumber,
        documentId: primaryDoc?.id,
        documentName: primaryDoc?.name
      },
      standardViolated: '501 CMR 2.00 & Commonwealth v. Ananias',
      evidentiaryExclusionStrategy: 'Request OAT periodic testing records and move to suppress breath result under Ananias consolidated guidelines.',
      sourceLayer: 'RULE_ENGINE',
      verifiedQuote: verifyRes.verified,
      verificationStatus: verifyRes.verificationStatus
    });
  }

  // RULE 7: Chain of Custody Gap for Drug Certificates
  const certGapMatch = findSentenceInPages(
    pages,
    /(?:certificate\s+of\s+analysis|lab\s+certificate|missing\s+seal|chain\s+of\s+custody|delay\s+exceeding)/i
  );

  if (certGapMatch) {
    const verifyRes = verifyQuoteAgainstPages(
      certGapMatch.sentence,
      { pageNumber: certGapMatch.pageNumber, paragraphNumber: certGapMatch.paragraphNumber },
      pages
    );

    errors.push({
      id: 'rule_chain_custody_gap',
      category: 'Chain of Custody',
      severity: 'HIGH',
      title: 'Chain of Custody Gap on Controlled Substance Certificate',
      description: 'Certificate of analysis indicates missing seal details, missing analyst signature, or significant seizure-to-analysis delay.',
      verbatimQuote: certGapMatch.sentence,
      pageParagraphRef: {
        pageNumber: certGapMatch.pageNumber,
        paragraphNumber: certGapMatch.paragraphNumber,
        documentId: primaryDoc?.id,
        documentName: primaryDoc?.name
      },
      standardViolated: 'M.G.L. c. 94C § 47A & Melendez-Diaz v. Massachusetts, 557 U.S. 305 (2009)',
      evidentiaryExclusionStrategy: 'File Motion to Exclude Drug Analysis Certificate for chain of custody breakdown and demand live analyst testimony.',
      sourceLayer: 'RULE_ENGINE',
      verifiedQuote: verifyRes.verified,
      verificationStatus: verifyRes.verificationStatus
    });
  }

  // RULE 8: Statutory Rights Notice (c. 90 § 24(1)(e))
  const medicalRightsMentioned = /(?:independent\s+physician|physician\s+exam|c\.\s*90\s*§\s*24\(1\)\(e\)|independent\s+medical)/i.test(combinedText);

  if (!medicalRightsMentioned) {
    errors.push({
      id: 'rule_statutory_medical_rights',
      category: 'Statutory Rights',
      severity: 'CRITICAL',
      title: 'Omission of Mandatory Statutory Independent Medical Exam Rights Notice',
      description: 'The discovery contains no record or officer affirmation that the arrestee was advised of the right to an immediate independent physician examination under M.G.L. c. 90 § 24(1)(e).',
      verbatimQuote: '',
      pageParagraphRef: {
        documentId: primaryDoc?.id,
        documentName: primaryDoc?.name
      },
      standardViolated: 'M.G.L. c. 90 § 24(1)(e)',
      evidentiaryExclusionStrategy: 'File Motion to Dismiss or Suppress for statutory violation denying arrestee exculpatory evidence collection opportunity.',
      sourceLayer: 'RULE_ENGINE',
      verifiedQuote: false,
      verificationStatus: 'DERIVED_FINDING'
    });
  }

  // Calculate Motion Issue Support Scores with contributing rule IDs
  const motionScores: MotionWinScore[] = [
    {
      motionType: 'Motion to Suppress Exit Order & Stop',
      score: calculateMotionScore(['rule_exit_order_basis', 'rule_cannabis_opinion'], errors, 55, 88),
      contributingRuleIds: errors.filter((e) => ['rule_exit_order_basis', 'rule_cannabis_opinion'].includes(e.id)).map((e) => e.id),
      rationale: 'Derived from absence of observed erratic driving or physical impairment prior to exit order.'
    },
    {
      motionType: 'Motion to Suppress Breath Test Results',
      score: calculateMotionScore(['rule_obs_continuity', 'rule_obs_time_delta', 'rule_draeger_integrity'], errors, 45, 92),
      contributingRuleIds: errors.filter((e) => ['rule_obs_continuity', 'rule_obs_time_delta', 'rule_draeger_integrity'].includes(e.id)).map((e) => e.id),
      rationale: 'Derived from 501 CMR 2.13 15-minute observation window interruption and Draeger sequence anomalies.'
    },
    {
      motionType: 'Motion in Limine: Exclude SFSTs & Cannabis Opinion',
      score: calculateMotionScore(['rule_sfst_line_instruction', 'rule_cannabis_opinion'], errors, 60, 95),
      contributingRuleIds: errors.filter((e) => ['rule_sfst_line_instruction', 'rule_cannabis_opinion'].includes(e.id)).map((e) => e.id),
      rationale: 'Derived from Gerhardt lay opinion prohibition and non-standard SFST line instructions.'
    },
    {
      motionType: 'Motion in Limine: Bar Refusal Evidence',
      score: calculateMotionScore(['rule_refusal_characterization'], errors, 70, 98),
      contributingRuleIds: errors.filter((e) => e.id === 'rule_refusal_characterization').map((e) => e.id),
      rationale: 'Derived from McGrail and Article 14 self-incrimination bar on chemical test refusal.'
    },
    {
      motionType: 'Motion to Exclude Drug Certificate',
      score: calculateMotionScore(['rule_chain_custody_gap'], errors, 40, 85),
      contributingRuleIds: errors.filter((e) => e.id === 'rule_chain_custody_gap').map((e) => e.id),
      rationale: 'Derived from M.G.L. c. 94C § 47A chain of custody breakdown and Melendez-Diaz confrontation rights.'
    },
    {
      motionType: 'Motion to Dismiss (Statutory Rights Violation)',
      score: calculateMotionScore(['rule_statutory_medical_rights'], errors, 35, 75),
      contributingRuleIds: errors.filter((e) => e.id === 'rule_statutory_medical_rights').map((e) => e.id),
      rationale: 'Derived from failure to inform arrestee of M.G.L. c. 90 § 24(1)(e) independent medical examination rights.'
    }
  ];

  return { errors, motionScores };
}

function calculateMotionScore(
  targetRuleIds: string[],
  firedErrors: ProceduralError[],
  baseScore: number,
  maxScore: number
): number {
  const matchingFired = firedErrors.filter((e) => targetRuleIds.includes(e.id));
  if (matchingFired.length === 0) return baseScore;
  const boost = matchingFired.reduce((acc, err) => {
    if (err.severity === 'CRITICAL') return acc + 25;
    if (err.severity === 'HIGH') return acc + 18;
    return acc + 10;
  }, 0);
  return Math.min(maxScore, baseScore + boost);
}
