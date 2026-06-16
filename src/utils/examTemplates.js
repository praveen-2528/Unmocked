export const EXAM_TEMPLATES = {
    ssc_cgl_tier1: {
        id: 'ssc_cgl_tier1',
        name: 'SSC CGL Tier-1',
        optionsPerQuestion: 4,
        durationSeconds: 3600, // 60 mins
        markingScheme: { correct: 2, incorrect: -0.5, unattempted: 0 },
        subjects: [
            {
                id: 'reasoning', name: 'General Intelligence & Reasoning', count: 25,
                topics: ['Analogies', 'Classification', 'Series', 'Coding-Decoding', 'Blood Relations', 'Direction Sense', 'Syllogism', 'Matrix', 'Word Arrangement', 'Venn Diagrams', 'Missing Numbers', 'Statement & Conclusion', 'Paper Folding & Cutting', 'Mirror & Water Image']
            },
            {
                id: 'awareness', name: 'General Awareness', count: 25,
                topics: ['Indian History', 'Geography', 'Polity & Constitution', 'Economics', 'General Science', 'Physics', 'Chemistry', 'Biology', 'Current Affairs', 'Static GK', 'Awards & Honours', 'Books & Authors', 'Sports']
            },
            {
                id: 'quant', name: 'Quantitative Aptitude', count: 25,
                topics: ['Number System', 'HCF & LCM', 'Simplification', 'Percentage', 'Ratio & Proportion', 'Average', 'Profit & Loss', 'Simple Interest', 'Compound Interest', 'Time & Work', 'Time Speed Distance', 'Algebra', 'Geometry', 'Trigonometry', 'Mensuration', 'Data Interpretation']
            },
            {
                id: 'english', name: 'English Comprehension', count: 25,
                topics: ['Reading Comprehension', 'Cloze Test', 'Fill in the Blanks', 'Spelling Correction', 'Idioms & Phrases', 'One Word Substitution', 'Sentence Improvement', 'Active & Passive Voice', 'Direct & Indirect Speech', 'Error Spotting', 'Synonyms & Antonyms', 'Para Jumbles']
            },
        ]
    },
    ibps_po_pre: {
        id: 'ibps_po_pre',
        name: 'IBPS PO Prelims',
        optionsPerQuestion: 5,
        durationSeconds: 3600, // 60 mins
        markingScheme: { correct: 1, incorrect: -0.25, unattempted: 0 },
        subjects: [
            {
                id: 'english', name: 'English Language', count: 30,
                topics: ['Reading Comprehension', 'Cloze Test', 'Fill in the Blanks', 'Error Spotting', 'Para Jumbles', 'Sentence Rearrangement', 'Vocabulary', 'Idioms & Phrases', 'Sentence Completion', 'Word Usage']
            },
            {
                id: 'quant', name: 'Quantitative Aptitude', count: 35,
                topics: ['Number Series', 'Simplification', 'Data Interpretation', 'Quadratic Equations', 'Percentage', 'Ratio & Proportion', 'Profit & Loss', 'Time & Work', 'Time Speed Distance', 'Simple & Compound Interest', 'Average', 'Mixture & Alligation', 'Probability', 'Permutation & Combination']
            },
            {
                id: 'reasoning', name: 'Reasoning Ability', count: 35,
                topics: ['Seating Arrangement', 'Puzzle', 'Syllogism', 'Inequality', 'Coding-Decoding', 'Blood Relations', 'Direction Sense', 'Order & Ranking', 'Machine Input-Output', 'Data Sufficiency', 'Alphabet & Number Series', 'Logical Reasoning']
            },
        ]
    },
    rrb_ntpc_cbt1: {
        id: 'rrb_ntpc_cbt1',
        name: 'RRB NTPC CBT-1',
        optionsPerQuestion: 4,
        durationSeconds: 5400, // 90 mins
        markingScheme: { correct: 1, incorrect: -0.33, unattempted: 0 },
        subjects: [
            {
                id: 'awareness', name: 'General Awareness', count: 40,
                topics: ['Indian History', 'Geography', 'Indian Economy', 'Polity & Governance', 'General Science', 'Current Affairs', 'Indian Culture', 'Famous Personalities', 'Awards & Honours', 'Sports', 'Important Dates', 'National & International Organizations']
            },
            {
                id: 'math', name: 'Mathematics', count: 30,
                topics: ['Number System', 'Decimals & Fractions', 'LCM & HCF', 'Ratio & Proportion', 'Percentage', 'Mensuration', 'Time & Work', 'Time Speed Distance', 'Simple & Compound Interest', 'Profit & Loss', 'Algebra', 'Geometry & Trigonometry', 'Statistics']
            },
            {
                id: 'reasoning', name: 'General Intelligence & Reasoning', count: 30,
                topics: ['Analogies', 'Classification', 'Number Series', 'Coding-Decoding', 'Syllogism', 'Blood Relations', 'Direction Sense', 'Statement & Conclusion', 'Venn Diagrams', 'Calendar & Clock', 'Mirror & Water Image', 'Mathematical Operations']
            },
        ]
    },

    // ── SSC CGL Tier-2 (Paper I: Mathematical Abilities + Reasoning, Paper II: English & GK) ──
    ssc_cgl_tier2: {
        id: 'ssc_cgl_tier2',
        name: 'SSC CGL Tier-2',
        optionsPerQuestion: 4,
        durationSeconds: 9000, // 2 hrs 30 mins
        markingScheme: { correct: 3, incorrect: -1, unattempted: 0 },
        subjects: [
            {
                id: 'quant', name: 'Mathematical Abilities', count: 30,
                topics: ['Number System', 'Algebra', 'Geometry', 'Trigonometry', 'Mensuration', 'Statistics', 'Data Interpretation', 'Percentage', 'Ratio & Proportion', 'Square Roots', 'Average', 'Interest', 'Profit & Loss', 'Discount', 'Partnership', 'Mixture & Alligation', 'Time & Distance', 'Time & Work', 'Surds & Indices']
            },
            {
                id: 'reasoning', name: 'Reasoning & General Intelligence', count: 30,
                topics: ['Analogies', 'Classification', 'Series', 'Coding-Decoding', 'Matrix', 'Word Formation', 'Venn Diagrams', 'Direction Sense', 'Blood Relations', 'Syllogism', 'Seating Arrangement', 'Puzzle', 'Statement & Conclusion', 'Paper Folding', 'Mirror & Water Image', 'Embedded Figures']
            },
            {
                id: 'english', name: 'English Language & Comprehension', count: 45,
                topics: ['Reading Comprehension', 'Cloze Test', 'Fill in the Blanks', 'Spelling Correction', 'Idioms & Phrases', 'One Word Substitution', 'Sentence Improvement', 'Active & Passive Voice', 'Direct & Indirect Speech', 'Error Spotting', 'Sentence Rearrangement', 'Para Jumbles', 'Synonyms & Antonyms']
            },
            {
                id: 'awareness', name: 'General Awareness', count: 25,
                topics: ['Indian History', 'Geography', 'Polity & Constitution', 'Economics', 'General Science', 'Physics', 'Chemistry', 'Biology', 'Current Affairs', 'Computer Awareness', 'Awards & Honours']
            },
            {
                id: 'computer', name: 'Computer Knowledge', count: 20,
                topics: ['Computer Fundamentals', 'Operating Systems', 'MS Office', 'Internet & Networking', 'Database Basics', 'Computer Security', 'Number Systems', 'Software & Hardware']
            },
        ]
    },

    // ── SSC CHSL Tier-1 ──────────────────────────────────────────────
    ssc_chsl_tier1: {
        id: 'ssc_chsl_tier1',
        name: 'SSC CHSL Tier-1',
        optionsPerQuestion: 4,
        durationSeconds: 3600, // 60 mins
        markingScheme: { correct: 2, incorrect: -0.5, unattempted: 0 },
        subjects: [
            {
                id: 'reasoning', name: 'General Intelligence & Reasoning', count: 25,
                topics: ['Analogies', 'Classification', 'Series', 'Coding-Decoding', 'Puzzle', 'Matrix', 'Word Formation', 'Venn Diagrams', 'Direction Sense', 'Blood Relations', 'Syllogism', 'Mirror & Water Image', 'Paper Folding & Cutting', 'Embedded Figures']
            },
            {
                id: 'english', name: 'English Language', count: 25,
                topics: ['Reading Comprehension', 'Cloze Test', 'Fill in the Blanks', 'Spelling Correction', 'Idioms & Phrases', 'One Word Substitution', 'Sentence Improvement', 'Active & Passive Voice', 'Direct & Indirect Speech', 'Error Spotting', 'Synonyms & Antonyms']
            },
            {
                id: 'quant', name: 'Quantitative Aptitude', count: 25,
                topics: ['Number System', 'Percentage', 'Ratio & Proportion', 'Average', 'Profit & Loss', 'Simple & Compound Interest', 'Time & Work', 'Time Speed Distance', 'Algebra', 'Geometry', 'Trigonometry', 'Mensuration', 'Data Interpretation', 'Statistics']
            },
            {
                id: 'awareness', name: 'General Awareness', count: 25,
                topics: ['Indian History', 'Geography', 'Polity & Constitution', 'Economics', 'General Science', 'Physics', 'Chemistry', 'Biology', 'Current Affairs', 'Static GK', 'Awards & Honours', 'Books & Authors', 'Sports']
            },
        ]
    },

    // ── SSC CHSL Tier-2 ──────────────────────────────────────────────
    ssc_chsl_tier2: {
        id: 'ssc_chsl_tier2',
        name: 'SSC CHSL Tier-2',
        optionsPerQuestion: 4,
        durationSeconds: 9000, // 2 hrs 30 mins
        markingScheme: { correct: 3, incorrect: -1, unattempted: 0 },
        subjects: [
            {
                id: 'quant', name: 'Mathematical Abilities', count: 30,
                topics: ['Number System', 'Algebra', 'Geometry', 'Trigonometry', 'Mensuration', 'Statistics', 'Data Interpretation', 'Percentage', 'Ratio & Proportion', 'Average', 'Interest', 'Profit & Loss', 'Time & Distance', 'Time & Work']
            },
            {
                id: 'reasoning', name: 'Reasoning & General Intelligence', count: 30,
                topics: ['Analogies', 'Classification', 'Series', 'Coding-Decoding', 'Venn Diagrams', 'Direction Sense', 'Blood Relations', 'Syllogism', 'Puzzle', 'Matrix', 'Paper Folding', 'Mirror & Water Image', 'Embedded Figures']
            },
            {
                id: 'english', name: 'English Language & Comprehension', count: 40,
                topics: ['Reading Comprehension', 'Cloze Test', 'Fill in the Blanks', 'Spelling Correction', 'Idioms & Phrases', 'One Word Substitution', 'Sentence Improvement', 'Active & Passive Voice', 'Direct & Indirect Speech', 'Error Spotting', 'Synonyms & Antonyms', 'Para Jumbles']
            },
            {
                id: 'awareness', name: 'General Awareness', count: 20,
                topics: ['Indian History', 'Geography', 'Polity & Constitution', 'Economics', 'General Science', 'Current Affairs', 'Computer Awareness']
            },
            {
                id: 'computer', name: 'Computer Knowledge', count: 15,
                topics: ['Computer Fundamentals', 'Operating Systems', 'MS Office', 'Internet & Networking', 'Database Basics', 'Computer Security']
            },
        ]
    },

    // ── SSC Stenographer Grade C & D ─────────────────────────────────
    ssc_steno_cd: {
        id: 'ssc_steno_cd',
        name: 'SSC Steno Grade C & D',
        optionsPerQuestion: 4,
        durationSeconds: 7200, // 2 hrs
        markingScheme: { correct: 1, incorrect: -0.25, unattempted: 0 },
        subjects: [
            {
                id: 'reasoning', name: 'General Intelligence & Reasoning', count: 50,
                topics: ['Analogies', 'Classification', 'Series', 'Coding-Decoding', 'Matrix', 'Word Formation', 'Venn Diagrams', 'Direction Sense', 'Blood Relations', 'Syllogism', 'Mirror & Water Image', 'Paper Folding & Cutting', 'Embedded Figures', 'Semantic Analogy', 'Symbolic Operations', 'Figural Pattern']
            },
            {
                id: 'awareness', name: 'General Awareness', count: 50,
                topics: ['Indian History', 'Geography', 'Polity & Constitution', 'Economics', 'General Science', 'Physics', 'Chemistry', 'Biology', 'Current Affairs', 'Static GK', 'Awards & Honours', 'Books & Authors', 'Sports', 'Important Dates', 'Inventions & Discoveries']
            },
            {
                id: 'english', name: 'English Language & Comprehension', count: 100,
                topics: ['Reading Comprehension', 'Cloze Test', 'Fill in the Blanks', 'Spelling Correction', 'Idioms & Phrases', 'One Word Substitution', 'Sentence Improvement', 'Active & Passive Voice', 'Direct & Indirect Speech', 'Error Spotting', 'Synonyms & Antonyms', 'Sentence Completion', 'Para Jumbles', 'Vocabulary', 'Grammar', 'Narration']
            },
        ]
    },
};
