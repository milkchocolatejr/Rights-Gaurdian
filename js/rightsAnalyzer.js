/* ============================================================
   Rights Guardian — constitutional-rights analyzer (library)

   Runs entirely in the browser — no server, no AI service. Each
   rule pairs trigger phrases (regexes matched against transcript
   lines) with the constitutional right at stake and its
   supporting legislature: amendment text plus controlling case
   law. Loaded as a plain script; the evidence page calls
   analyzeTranscript() on page load.

   analyzeTranscript(lines) -> evidence[]
     lines:    [{ speaker, start, end, text }]
     evidence: [{ id, speaker, start, end, clock, quote, right,
                  amendment, explanation, legislature: [{cite, summary}] }]
   ============================================================ */

const RIGHTS_RULES = [
  {
    id: 'first-recording',
    right: 'Right to record public officials',
    amendment: 'First Amendment',
    patterns: [
      /stop (recording|filming|taping)/i,
      /turn (off|that) (the )?(camera|phone)( off)?/i,
      /put (the|that|your) (phone|camera) (away|down)/i,
      /delete (that|the|this) (video|footage|recording)/i,
      /you can'?t (film|record|tape)/i,
      /(no|stop) (filming|cameras) (allowed|here)/i,
    ],
    explanation:
      'Ordering a citizen to stop recording police performing public duties, or to delete ' +
      'footage, implicates the First Amendment right to gather and record information ' +
      'about government officials in public.',
    legislature: [
      { cite: 'U.S. Const. amend. I',
        summary: 'Protects freedom of speech and of the press, including gathering information about government officials in public.' },
      { cite: 'Glik v. Cunniffe, 655 F.3d 78 (1st Cir. 2011)',
        summary: 'Recording public officials, including police, in public spaces is a clearly established First Amendment right.' },
      { cite: 'Fields v. City of Philadelphia, 862 F.3d 353 (3d Cir. 2017)',
        summary: 'The First Amendment protects recording police activity in public, subject only to reasonable time/place/manner limits.' },
    ],
  },
  {
    id: 'fourth-search',
    right: 'Protection against unreasonable search',
    amendment: 'Fourth Amendment',
    patterns: [
      /i do(n'?t| not) consent to (a |any |this )?search/i,
      /do you have a (search )?warrant/i,
      /without a warrant/i,
      /(open|pop) (the|your) trunk/i,
      /empty your pockets/i,
      /(going to|gonna|let me|i'?m going to) search (you|your|the) ?(car|vehicle|house|home|bag|phone|pockets|person)?/i,
      /(unlock|hand over|give me) (your|the) phone/i,
    ],
    explanation:
      'A search conducted without a warrant, consent, or a recognized exception is ' +
      'presumptively unreasonable under the Fourth Amendment. An explicit refusal of ' +
      'consent is significant evidence if a search proceeds anyway.',
    legislature: [
      { cite: 'U.S. Const. amend. IV',
        summary: 'Guarantees the right of the people to be secure against unreasonable searches and seizures; warrants require probable cause.' },
      { cite: 'Katz v. United States, 389 U.S. 347 (1967)',
        summary: 'Warrantless searches are per se unreasonable, subject to a few specifically established exceptions.' },
      { cite: 'Riley v. California, 573 U.S. 373 (2014)',
        summary: 'Police generally may not search the digital contents of a cell phone without a warrant, even incident to arrest.' },
      { cite: 'Arizona v. Gant, 556 U.S. 332 (2009)',
        summary: 'Vehicle searches incident to arrest are limited to areas the arrestee can reach or where offense-related evidence may be found.' },
    ],
  },
  {
    id: 'fourth-detention',
    right: 'Protection against unlawful detention',
    amendment: 'Fourth Amendment',
    patterns: [
      /am i (being )?detained/i,
      /am i free to (go|leave)/i,
      /you('?re| are) not free to (go|leave)/i,
      /i('?m| am) detaining you/i,
      /you('?re| are) not going anywhere/i,
    ],
    explanation:
      'A detention (seizure) requires reasonable, articulable suspicion of criminal ' +
      'activity, and may not last longer than necessary to resolve that suspicion. ' +
      'Asking "am I being detained / am I free to go" marks the moment the encounter\'s ' +
      'legal status is contested.',
    legislature: [
      { cite: 'U.S. Const. amend. IV',
        summary: 'A person is "seized" when a reasonable person would not feel free to leave; seizures must be reasonable.' },
      { cite: 'Terry v. Ohio, 392 U.S. 1 (1968)',
        summary: 'Brief investigative stops require reasonable, articulable suspicion of criminal activity.' },
      { cite: 'Rodriguez v. United States, 575 U.S. 348 (2015)',
        summary: 'A stop may not be prolonged beyond the time needed to complete its original mission without new suspicion.' },
    ],
  },
  {
    id: 'fifth-silence',
    right: 'Right against self-incrimination',
    amendment: 'Fifth Amendment',
    patterns: [
      /i (wish|want|am going) to remain silent/i,
      /i('?m| am) (invoking|pleading) the fifth/i,
      /i('?m| am) not answering (any )?questions/i,
      /you (have|need) to answer (me|my questions|the question)/i,
      /answer (my|the) questions?,? or/i,
      /if you (don'?t|won'?t) (talk|answer|cooperate)/i,
    ],
    explanation:
      'Once a person invokes the right to remain silent, continued or coercive ' +
      'questioning implicates the Fifth Amendment privilege against compelled ' +
      'self-incrimination.',
    legislature: [
      { cite: 'U.S. Const. amend. V',
        summary: 'No person shall be compelled in any criminal case to be a witness against himself.' },
      { cite: 'Miranda v. Arizona, 384 U.S. 436 (1966)',
        summary: 'Custodial interrogation requires warnings; if the suspect indicates a wish to remain silent, interrogation must cease.' },
    ],
  },
  {
    id: 'sixth-counsel',
    right: 'Right to counsel',
    amendment: 'Sixth Amendment',
    patterns: [
      /i want (a|my) (lawyer|attorney)/i,
      /i('?d| would) like (a|my) (lawyer|attorney)/i,
      /(talk|speak) to (a|my) (lawyer|attorney)/i,
      /you do(n'?t| not) (need|get) a lawyer/i,
      /a lawyer (can'?t|won'?t) help you/i,
    ],
    explanation:
      'After an unambiguous request for counsel, interrogation must stop until an ' +
      'attorney is present. Discouraging a person from obtaining counsel cuts against ' +
      'the Sixth Amendment guarantee.',
    legislature: [
      { cite: 'U.S. Const. amend. VI',
        summary: 'In all criminal prosecutions, the accused shall enjoy the right to have the assistance of counsel for his defence.' },
      { cite: 'Edwards v. Arizona, 451 U.S. 477 (1981)',
        summary: 'Once counsel is requested, interrogation must cease and may not resume without counsel present.' },
      { cite: 'Gideon v. Wainwright, 372 U.S. 335 (1963)',
        summary: 'The right to counsel is fundamental and applies to the states through the Fourteenth Amendment.' },
    ],
  },
  {
    id: 'fourteenth-coercion',
    right: 'Due process — coercive threats',
    amendment: 'Fifth & Fourteenth Amendments',
    patterns: [
      /we can do this the (easy|hard) way/i,
      /things will (go|get) (a lot )?(worse|harder)/i,
      /make (this|it) (hard|difficult|worse) for you/i,
      /(cooperate|comply),? or (else|we)/i,
    ],
    explanation:
      'Threats used to extract compliance or statements bear on the voluntariness of ' +
      'anything said afterward; involuntary statements violate due process.',
    legislature: [
      { cite: 'U.S. Const. amend. XIV, § 1',
        summary: 'No State shall deprive any person of life, liberty, or property, without due process of law.' },
      { cite: 'Arizona v. Fulminante, 499 U.S. 279 (1991)',
        summary: 'A confession obtained through coercion — including credible threats — is involuntary and inadmissible.' },
    ],
  },
];

/* All-party ("two-party") consent states: recording a conversation may
   require every participant's consent. Session-level advisory only. */
const STATE_RECORDING_LAW = {
  CA: { statute: 'Cal. Penal Code § 632',            note: 'California requires the consent of all parties to record a confidential conversation.' },
  DE: { statute: 'Del. Code tit. 11, § 2402',        note: 'Delaware generally requires all-party consent to intercept oral communications.' },
  FL: { statute: 'Fla. Stat. § 934.03',              note: 'Florida requires all-party consent to record oral communications.' },
  IL: { statute: '720 Ill. Comp. Stat. 5/14-2',      note: 'Illinois requires all-party consent for private conversations.' },
  MD: { statute: 'Md. Code, Cts. & Jud. Proc. § 10-402', note: 'Maryland requires all-party consent to record private conversations.' },
  MA: { statute: 'Mass. Gen. Laws ch. 272, § 99',    note: 'Massachusetts prohibits secret recording of oral communications.' },
  MI: { statute: 'Mich. Comp. Laws § 750.539c',      note: 'Michigan generally requires consent of all participants to record private conversations.' },
  MT: { statute: 'Mont. Code Ann. § 45-8-213',       note: 'Montana requires knowledge of all parties to record a conversation.' },
  NH: { statute: 'N.H. Rev. Stat. Ann. § 570-A:2',   note: 'New Hampshire requires all-party consent to record oral communications.' },
  PA: { statute: '18 Pa. Cons. Stat. § 5704',        note: 'Pennsylvania requires all-party consent to record oral communications.' },
  WA: { statute: 'Wash. Rev. Code § 9.73.030',       note: 'Washington requires the consent of all parties to record private conversations.' },
};

function analyzerClock(secondsFloat) {
  const m = Math.floor(secondsFloat / 60);
  const s = Math.floor(secondsFloat % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/* Scan every transcript line against every rule. One evidence item per
   (line, rule) hit — the same line can implicate multiple rights. */
function analyzeTranscript(lines) {
  const evidence = [];
  (lines || []).forEach((line, i) => {
    if (!line || typeof line.text !== 'string') return;
    for (const rule of RIGHTS_RULES) {
      if (rule.patterns.some((re) => re.test(line.text))) {
        evidence.push({
          id: `${rule.id}-${i}`,
          speaker: line.speaker ?? null,
          start: line.start ?? null,
          end: line.end ?? null,
          clock: line.start != null ? analyzerClock(line.start) : null,
          quote: line.text,
          right: rule.right,
          amendment: rule.amendment,
          explanation: rule.explanation,
          legislature: rule.legislature,
        });
      }
    }
  });
  return evidence;
}

/* State-level advisory for the session (or null). `state` is a 2-letter code. */
function stateAdvisory(state) {
  const law = STATE_RECORDING_LAW[(state || '').toUpperCase()];
  return law ? { state: state.toUpperCase(), ...law } : null;
}

/* Also loadable in Node for tests: node -e "require('./js/rightsAnalyzer.js')..." */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { analyzeTranscript, stateAdvisory, RIGHTS_RULES, analyzerClock };
}
