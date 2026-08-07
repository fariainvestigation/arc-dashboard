import { MAAuthority } from '../types';

/**
 * Massachusetts Legal Authorities Database
 * Curated table for Massachusetts OUI and Drug Defense analysis.
 */
export const MASSACHUSETTS_AUTHORITIES: MAAuthority[] = [
  {
    id: 'mgl_c90_s24',
    title: 'Operating Under the Influence of Intoxicating Liquor or Drugs',
    citation: 'M.G.L. c. 90 § 24',
    type: 'Statute',
    summary: 'Governs the offense of operating a motor vehicle while under the influence of alcohol or drugs in Massachusetts, outlining elements of proof and penalties.',
    keyHoldings: [
      'Prosecution must prove operation, public way/place, and impaired ability or 0.08+ BAC.',
      'Statutory penalties escalate for subsequent offenses.',
      'Mandates statutory rights notice upon arrest.'
    ],
    verificationNote: 'Local knowledge-bank reference only; CourtListener/attorney verification required before use.'
  },
  {
    id: 'mgl_c90_s24_1_e',
    title: 'Right to Independent Physician Examination',
    citation: 'M.G.L. c. 90 § 24(1)(e)',
    type: 'Statute',
    summary: 'Grants an arrested driver the absolute statutory right to be evaluated by an independent physician at their own expense immediately following arrest.',
    keyHoldings: [
      'Police must afford reasonable opportunity and notice of right to independent medical exam.',
      'Failure to inform or facilitate can mandate suppression or dismissal.'
    ],
    verificationNote: 'Local knowledge-bank reference only; CourtListener/attorney verification required before use.'
  },
  {
    id: 'mgl_c90_s24_1_f_1',
    title: 'Chemical Test Refusal and License Consequences',
    citation: 'M.G.L. c. 90 § 24(1)(f)(1)',
    type: 'Statute',
    summary: 'Establishes administrative license suspension penalties for refusing chemical breath or blood testing.',
    keyHoldings: [
      'Refusal results in immediate administrative license suspension by RMV.',
      'Police must administer mandatory statutory refusal warnings prior to test.'
    ],
    verificationNote: 'Local knowledge-bank reference only; CourtListener/attorney verification required before use.'
  },
  {
    id: 'mgl_c94c_s47a',
    title: 'Certificate of Drug Analysis and Chain of Custody',
    citation: 'M.G.L. c. 94C § 47A',
    type: 'Statute',
    summary: 'Sets requirements for chemical certificates of analysis and evidentiary standards for controlled substances.',
    keyHoldings: [
      'Requires verified chain of custody and accredited laboratory procedures.',
      'Analyst signature and sample sealing details are required.'
    ],
    verificationNote: 'Local knowledge-bank reference only; CourtListener/attorney verification required before use.'
  },
  {
    id: 'mgl_c66_s10',
    title: 'Public Records Requests for Departmental SOPs',
    citation: 'M.G.L. c. 66 § 10',
    type: 'Statute',
    summary: 'Authorizes public records requests for departmental standard operating procedures, maintenance logs, and officer training credentials.',
    keyHoldings: [
      'Departmental SOPs and Draeger logs are discoverable public records.',
      'Allows defense counsel to audit departmental compliance.'
    ],
    verificationNote: 'Local knowledge-bank reference only; CourtListener/attorney verification required before use.'
  },
  {
    id: 'cmr_501_200',
    title: 'Office of Alcohol Testing Regulations (15-Minute Observation)',
    citation: '501 CMR 2.00 & 2.13',
    type: 'CMR',
    summary: 'Promulgated regulations by Executive Office of Public Safety governing breath testing equipment, certification, and mandatory 15-minute uninterrupted observation window.',
    keyHoldings: [
      '501 CMR 2.13 requires 15 minutes of uninterrupted observation prior to breath sample.',
      'Officer must not perform secondary tasks that distract from continuous observation.',
      'Operator must hold valid OAT certification on date of test.'
    ],
    verificationNote: 'Local knowledge-bank reference only; CourtListener/attorney verification required before use.'
  },
  {
    id: 'art_14_declaration_rights',
    title: 'Protection Against Unreasonable Searches and Seizures',
    citation: 'Article 14, Massachusetts Declaration of Rights',
    type: 'Constitutional',
    summary: 'Provides greater constitutional protection than the Fourth Amendment regarding traffic stops, exit orders, and bodily intrusions.',
    keyHoldings: [
      'Exit orders require reasonable suspicion of officer safety threat or criminal activity.',
      'Refusal to perform field sobriety tests cannot be introduced as evidence of consciousness of guilt.'
    ],
    verificationNote: 'Local knowledge-bank reference only; CourtListener/attorney verification required before use.'
  },
  {
    id: 'comm_v_gerhardt',
    title: 'Lay Opinion Limits on Cannabis Impairment and SFSTs',
    // VERIFY BEFORE PRODUCTION USE: 477 Mass. 775 (2017)
    citation: 'Commonwealth v. Gerhardt, 477 Mass. 775 (2017)',
    type: 'Case Law',
    summary: 'Landmark decision establishing limits on police testimony regarding suspected marijuana impairment.',
    keyHoldings: [
      'Police officers may not testify that a driver was under the influence of marijuana.',
      'Officers cannot state that a driver failed field sobriety tests due to marijuana.',
      'SFSTs were standardized for alcohol, not cannabis impairment.'
    ],
    verificationNote: 'Local knowledge-bank reference only; CourtListener/attorney verification required before use.'
  },
  {
    id: 'comm_v_cruz',
    title: 'Odor of Burnt Marijuana Alone Insufficient for Exit Order',
    // VERIFY BEFORE PRODUCTION USE: 459 Mass. 459 (2011)
    citation: 'Commonwealth v. Cruz, 459 Mass. 459 (2011)',
    type: 'Case Law',
    summary: 'Establishes that the odor of burnt marijuana alone does not justify an exit order or search.',
    keyHoldings: [
      'Decriminalization of small amounts of marijuana removed automatic reasonable suspicion.',
      'Odor alone without observed impairment or safety risk violates Article 14.'
    ],
    verificationNote: 'Local knowledge-bank reference only; CourtListener/attorney verification required before use.'
  },
  {
    id: 'comm_v_mcgrail',
    title: 'Refusal to Perform Field Sobriety Tests Inadmissible',
    // VERIFY BEFORE PRODUCTION USE: 419 Mass. 774 (1995)
    citation: 'Commonwealth v. McGrail, 419 Mass. 774 (1995)',
    type: 'Case Law',
    summary: 'Holds that evidence of a defendant refusal to consent to field sobriety tests is inadmissible under Article 14.',
    keyHoldings: [
      'Refusal is compelled self-incriminating evidence under Mass Declaration of Rights.',
      'Jury may not hear evidence or argument regarding SFST refusal.'
    ],
    verificationNote: 'Local knowledge-bank reference only; CourtListener/attorney verification required before use.'
  },
  {
    id: 'comm_v_blais',
    title: 'Exit Order Standard for Roadside OUI Investigation',
    // VERIFY BEFORE PRODUCTION USE: 428 Mass. 294 (1998)
    citation: 'Commonwealth v. Blais, 428 Mass. 294 (1998)',
    type: 'Case Law',
    summary: 'Defines the legal threshold required before an officer may order a driver out of a vehicle for field sobriety tests.',
    keyHoldings: [
      'Exit order requires reasonable, articulable suspicion of OUI based on driving or observed physical signs.',
      'General hunch or mere odor of alcohol without other indicators is insufficient.'
    ],
    verificationNote: 'Local knowledge-bank reference only; CourtListener/attorney verification required before use.'
  },
  {
    id: 'comm_v_davis',
    title: 'Breath Test Observation Compliance Requirement',
    // VERIFY BEFORE PRODUCTION USE: 481 Mass. 440 (2019)
    citation: 'Commonwealth v. Davis, 481 Mass. 440 (2019)',
    type: 'Case Law',
    summary: 'Strict enforcement of the 15-minute observation window required by OAT regulations.',
    keyHoldings: [
      'Observation window must be continuous and uninterrupted.',
      'Officer distraction or multitask during window invalidates breath test result.'
    ],
    verificationNote: 'Local knowledge-bank reference only; CourtListener/attorney verification required before use.'
  },
  {
    id: 'comm_v_ananias',
    title: 'OAT Breath Test Litigation Consolidated Exclusion',
    // VERIFY BEFORE PRODUCTION USE: Mass. Super. Ct. Consolidated Litigation (2019)
    citation: 'Commonwealth v. Ananias, Mass. Super. Ct. (2019)',
    type: 'Case Law',
    summary: 'Consolidated litigation regarding Draeger Alcotest 9510 calibration and OAT methodology defects resulting in breath test exclusion period.',
    keyHoldings: [
      'Excludes Draeger breath tests administered during uncalibrated periods.',
      'Requires strict proof of OAT compliance and software validation.'
    ],
    verificationNote: 'Local knowledge-bank reference only; CourtListener/attorney verification required before use.'
  },
  {
    id: 'melendez_diaz',
    title: 'Confrontation Clause and Forensic Drug Certificates',
    // VERIFY BEFORE PRODUCTION USE: 557 U.S. 305 (2009)
    citation: 'Melendez-Diaz v. Massachusetts, 557 U.S. 305 (2009)',
    type: 'Case Law',
    summary: 'U.S. Supreme Court ruling that drug certificates of analysis are testimonial statements subject to Sixth Amendment Confrontation Clause.',
    keyHoldings: [
      'Lab certificates cannot be admitted without live testimony from the analyzing chemist.',
      'Affirms constitutional right to cross-examine lab analysts.'
    ],
    verificationNote: 'Local knowledge-bank reference only; CourtListener/attorney verification required before use.'
  },
  {
    id: 'nhtsa_sfst_manual',
    title: 'NHTSA DWI Detection and Standardized Field Sobriety Testing Student Manual',
    // VERIFY BEFORE PRODUCTION USE: NHTSA SFST Manual
    citation: 'NHTSA SFST Manual (Standardized Script & Scoring)',
    type: 'SOP/Manual',
    summary: 'National Highway Traffic Safety Administration standardized protocols for HGN, Walk and Turn, and One Leg Stand tests.',
    keyHoldings: [
      'Mandates verbatim instructional scripts including 9 heel-to-toe steps, arms at sides, and 6-inch foot raise.',
      'Deviations from standardized administration invalidate test reliability.'
    ],
    verificationNote: 'Local knowledge-bank reference only; CourtListener/attorney verification required before use.'
  },
  {
    id: 'mptc_oui_curriculum',
    title: 'MPTC OUI Law Enforcement Training Curriculum',
    // VERIFY BEFORE PRODUCTION USE: MPTC OUI Training Manual
    citation: 'MPTC OUI Curriculum (Three-Phase Protocol)',
    type: 'SOP/Manual',
    summary: 'Municipal Police Training Committee standard curriculum for Massachusetts police officers regarding OUI enforcement.',
    keyHoldings: [
      'Establishes three-phase detection: Vehicle in Motion, Personal Contact, Pre-Arrest Screening.',
      'Standardizes report writing and observation documentation.'
    ],
    verificationNote: 'Local knowledge-bank reference only; CourtListener/attorney verification required before use.'
  },
  {
    id: 'bpd_rule_300',
    title: 'Boston Police Department Traffic Enforcement & Form 1907',
    // VERIFY BEFORE PRODUCTION USE: Boston Police Dept Rule 300 Series
    citation: 'Boston Police Department Rule 300 Series (Form 1907)',
    type: 'SOP/Manual',
    summary: 'Departmental directives governing traffic stops, OUI arrests, and mandatory BPD Form 1907 incident documentation.',
    keyHoldings: [
      'Requires detailed sequential narrative of roadside observations.',
      'Mandates precise recordation of breath test sequence and rights notifications.'
    ],
    verificationNote: 'Local knowledge-bank reference only; CourtListener/attorney verification required before use.'
  },
  {
    id: 'mspcl_item_analysis_policy',
    title: 'Massachusetts State Police Crime Laboratory Item Analysis Policy (ID: 4163 Rev 6)',
    citation: 'MSPCL Item Analysis Policy ID: 4163 Rev 6 (2026)',
    type: 'SOP/Manual',
    summary: 'Establishes official intake, testing scope, and processing priorities for all forensic evidence submitted to the MSP Crime Laboratory across Drug, Toxicology, DNA, and Firearms units.',
    keyHoldings: [
      'Drug possession-only charges will not be processed for DNA or latent fingerprints (Section 2.4.1).',
      'Hypodermic syringes are rejected without prior Deputy Director/Director approval in non-homicide cases (Section 2.5.1).',
      'One-touch skin cell DNA evidence on paper, keys, or doorknobs is strictly denied analysis due to technology limits (Section 4.3.2).',
      'OUI blood samples are routinely tested for both ethanol and drugs regardless of BAC level (Section 6.1.2).'
    ],
    verificationNote: 'Local knowledge-bank reference only; CourtListener/attorney verification required before use.'
  },
  {
    id: 'mspcl_drug_sampling_k_factor',
    title: 'MSPCL Seized Drug Hypergeometric Statistical Sampling Notice (k factor 0.7 at 95% CL)',
    citation: 'MSPCL Forensic Services Notice (Effective June 10, 2026)',
    type: 'SOP/Manual',
    summary: 'Mandates statistical hypergeometric sampling for multi-item drug seizures with k factor of 0.7 or 0.9 at 95% confidence level to evaluate statutory threshold weights.',
    keyHoldings: [
      'Allows testing a representative sample (e.g. 8 of 76 bags) to make statistical inferences about population threshold weights.',
      'Requires individual items in the sampled population to be physically and chemically identical; non-identical results void the hypergeometric plan.',
      'Certificates of Drug Analysis must explicitly state the k factor confidence percentage applied.'
    ],
    verificationNote: 'Local knowledge-bank reference only; CourtListener/attorney verification required before use.'
  }
];
