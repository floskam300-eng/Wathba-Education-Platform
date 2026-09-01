const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const pool = require('../db/connection');
const { authenticate, requireRole } = require('../middleware/auth');
const { getPermissions } = require('../lib/permissionsCache');
const {
  formatEgyptDateTime,
  parseEgyptDateTimeToUTC,
  getPeriodStart
} = require('../lib/timezone');

router.use(authenticate);

// ── Multi-Game Catalog Definition ─────────────────────────────────────────────
const GAME_CATALOG = [
  {
    id: 'stickman_run',
    title: 'مغامرة الستيكمان',
    subtitle: 'اركض، اقفز، انحنِ وتجاوز العقبات وأجب عن تحديات الزعماء!',
    icon: '🏃',
    category: 'runner',
    badge: 'مغامرة وركض',
    gradient: 'from-purple-600 via-indigo-600 to-purple-800',
    accentColor: '#8b5cf6',
    defaultQuestionsCount: 3,
    rules: [
      'Space أو السهم للأعلى للقفز والقفز المزدوج',
      'السهم للأسفل للانحناء تحت العقبات الطائرة',
      'اهزم الزعماء بالإجابة الصحيحة على الأسئلة',
      'لديك 3 محاولات طاقة في كل جولة'
    ]
  },
  {
    id: 'space_blaster',
    title: 'حرب البط الفضائي',
    subtitle: 'حلق بسفينتك الفضائية، دمر سرب البط الفضائي وتفادَ قذائف البيض واشحن مدفع الليزر بالأسئلة!',
    icon: '🦆',
    category: 'arcade',
    badge: 'غزو بط الفضاء 🚀',
    gradient: 'from-cyan-600 via-blue-600 to-indigo-800',
    accentColor: '#06b6d4',
    defaultQuestionsCount: 3,
    rules: [
      'حرك السفينة بالأسهم أو سحب الإصبع على الشاشة',
      'Space أو زر الإطلاق لإطلاق قذائف الليزر',
      'دمر سرب البط الفضائي وتفادَ قذائف البيض 🥚',
      'أجب عن أسئلة زعيم البط لهزيمته بالليزر الخارق'
    ]
  },
  {
    id: 'tower_of_riddles',
    title: 'برج الفوازير والكنوز',
    subtitle: 'تسلق طوابق البرج السحري وافتح بوابات الألغاز وصناديق الكنوز بذكائك!',
    icon: '🏰',
    category: 'puzzle',
    badge: 'ذكاء وفوازير',
    gradient: 'from-amber-600 via-orange-600 to-amber-800',
    accentColor: '#f59e0b',
    defaultQuestionsCount: 4,
    rules: [
      'تسلق الطوابق طابقاً تلو الآخر',
      'حل لغز البوابة لفتح الطابق التالي وصندوق الذهب',
      'استخدم وسائل المساعدة: حذف إجابتين (50:50) أو تجميد الوقت',
      'اكسب بونص مضاعف عند الوصول لقمة البرج'
    ]
  },
  {
    id: 'bubble_blitz',
    title: 'فرقعة الفقاعات العبقرية',
    subtitle: 'فرقع الفقاعات الطائرة بالإجابات الصحيحة بأسرع وقت واجمع الكومبو!',
    icon: '🫧',
    category: 'action',
    badge: 'سرعة وتدريب',
    gradient: 'from-emerald-600 via-teal-600 to-emerald-800',
    accentColor: '#10b981',
    defaultQuestionsCount: 5,
    rules: [
      'انقر أو المس الفقاعة التي تحتوي على الإجابة الصحيحة',
      'فرقعة الفقاعات بسرعة يزيد من مضاعف الـ Combo',
      'احذر من فرقعة الفقاعة الخاطئة لتجنب خسارة المحاولة',
      'أكمل جميع الأسئلة للحصول على كأس التميز'
    ]
  }
];

// ── Default Educational Questions by Stage (Rich Fallback Bank) ───────────────
const DEFAULT_STAGE_QUESTIONS = {
  general: [
    {
      question_text: 'ما هو أكبر كوكب في مجموعتنا الشمسية؟',
      choices: ['المشتري', 'زحل', 'الأرض', 'المريخ'],
      correct_index: 0,
      enemy_label: 'زعيم المعرفة الأول',
      level_number: 1
    },
    {
      question_text: 'ما هي عاصمة جمهورية مصر العربية؟',
      choices: ['القاهرة', 'الإسكندرية', 'الجيزة', 'الأقصر'],
      correct_index: 0,
      enemy_label: 'زعيم المعرفة الثاني',
      level_number: 2
    },
    {
      question_text: 'كم عدد أضلاع الشكل السداسي المنتظم؟',
      choices: ['6 أضلاع', '5 أضلاع', '7 أضلاع', '8 أضلاع'],
      correct_index: 0,
      enemy_label: 'الزعيم الأكبر',
      level_number: 3
    },
    {
      question_text: 'ما هو أسرع كائن حي بري في العالم؟',
      choices: ['الفهد الصياد', 'الأسد', 'الحصان العربي', 'الصقر'],
      correct_index: 0,
      enemy_label: 'حارس البرج',
      level_number: 4
    },
    {
      question_text: 'ما هو العضو المسؤول عن ضخ الدم في جسم الإنسان؟',
      choices: ['القلب', 'الرئتان', 'الكبد', 'المعدة'],
      correct_index: 0,
      enemy_label: 'سيد الحكمة',
      level_number: 5
    }
  ]
};

// ── Helper to resolve teacher ID for multi-tenant isolation ───────────────────
function getTeacherId(req) {
  if (req.user.role === 'teacher') return req.user.id;
  if (req.user.role === 'assistant') return req.user.teacher_id;
  return req.user.teacher_id;
}

// ── Helper to check assistant permission ─────────────────────────────────────
async function checkManageEventsPerm(req, res, next) {
  if (req.user.role === 'teacher') return next();
  if (req.user.role === 'assistant') {
    const perms = await getPermissions(req.user.id);
    if (perms && perms.can_manage_events === true) {
      return next();
    }
    return res.status(403).json({ error: 'ليس لديك صلاحية إدارة الفعاليات والألعاب' });
  }
  return res.status(403).json({ error: 'غير مصرح' });
}

// ── Feature Flag Middleware (stickman_run / events) ──────────────────────────
router.use(async (req, res, next) => {
  if (!req.user) return next();
  const teacherId = getTeacherId(req);
  if (!teacherId) return next();

  try {
    const { rows } = await pool.query(
      `SELECT features_enabled FROM teachers WHERE id = $1`,
      [teacherId]
    );
    const features = rows[0]?.features_enabled || {};
    if (features.stickman_run === false && features.events === false) {
      return res.status(403).json({ error: 'خاصية الفعاليات والألعاب غير مفعلة لهذه المنصة' });
    }
    next();
  } catch (err) {
    console.error('[events route feature check error]:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── In-Memory Session Cache for Active Game Plays (with server-side answers) ──
const _activeGameSessions = new Map();
const SESSION_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours

setInterval(() => {
  const now = Date.now();
  for (const [token, sess] of _activeGameSessions.entries()) {
    if (now - sess.createdAt > SESSION_TTL_MS) {
      _activeGameSessions.delete(token);
    }
  }
}, 30 * 60 * 1000).unref();

// ══════════════════════════════════════════════════════════════════════════════
// ── STUDENT ENDPOINTS ────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

// ── 1. GET /api/events/list — Get all available games with student play status
router.get('/list', requireRole('student'), async (req, res) => {
  try {
    const studentId = req.user.id;
    const teacherId = req.user.teacher_id;
    const studentStage = req.user.academic_stage || '';

    // Fetch teacher's custom game settings
    const { rows: customConfigs } = await pool.query(
      `SELECT * FROM teacher_game_events WHERE teacher_id = $1`,
      [teacherId]
    );
    const configMap = new Map();
    customConfigs.forEach(cfg => configMap.set(cfg.game_id, cfg));

    // Fetch student's recent plays per game
    const { rows: plays } = await pool.query(
      `SELECT game_id, COUNT(*)::int AS total_plays,
              MAX(score) AS high_score,
              SUM(points_earned)::int AS total_points_earned,
              MAX(played_at) AS last_played_at
       FROM game_plays_history
       WHERE student_id = $1
       GROUP BY game_id`,
      [studentId]
    );
    const playsMap = new Map();
    plays.forEach(p => playsMap.set(p.game_id, p));

    const now = new Date();

    const result = await Promise.all(GAME_CATALOG.map(async (game) => {
      const cfg = configMap.get(game.id) || {
        is_enabled: true,
        points_per_question: 20,
        completion_bonus_points: 50,
        allowed_attempts: 0, // 0 = unlimited
        reset_frequency: 'weekly',
        question_pull_mode: 'unseen_first',
        questions_per_play: game.defaultQuestionsCount,
        start_time: null,
        end_time: null,
        target_stages: []
      };

      // Stage restriction check
      if (Array.isArray(cfg.target_stages) && cfg.target_stages.length > 0) {
        if (!cfg.target_stages.includes(studentStage)) {
          return {
            ...game,
            ...cfg,
            isAvailable: false,
            unavailableReason: 'غير متاح لمرحلتك الدراسية'
          };
        }
      }

      // Schedule window check (Cairo timezone aware)
      let isScheduleActive = true;
      let scheduleNotice = null;
      if (cfg.start_time && new Date(cfg.start_time) > now) {
        isScheduleActive = false;
        scheduleNotice = `يفتح في: ${formatEgyptDateTime(cfg.start_time)}`;
      } else if (cfg.end_time && new Date(cfg.end_time) < now) {
        isScheduleActive = false;
        scheduleNotice = 'انتهت فترة الفعالية';
      }

      // Attempts in current period check (Egypt Cairo Anchor)
      const periodStart = getPeriodStart(cfg.reset_frequency, now);
      const { rows: periodPlays } = await pool.query(
        `SELECT COUNT(*)::int AS count FROM game_plays_history
         WHERE student_id = $1 AND game_id = $2 AND played_at >= $3`,
        [studentId, game.id, periodStart.toISOString()]
      );
      const playsInPeriod = periodPlays[0]?.count || 0;
      const allowed = parseInt(cfg.allowed_attempts, 10) || 0;
      const remainingAttempts = allowed > 0 ? Math.max(0, allowed - playsInPeriod) : null;
      const isPlayable = cfg.is_enabled && isScheduleActive && (allowed === 0 || remainingAttempts > 0);

      const playStats = playsMap.get(game.id) || {
        total_plays: 0,
        high_score: 0,
        total_points_earned: 0,
        last_played_at: null
      };

      return {
        ...game,
        title: cfg.title || game.title,
        subtitle: cfg.description || game.subtitle,
        isEnabled: cfg.is_enabled !== false,
        isPlayable,
        isScheduleActive,
        scheduleNotice,
        startTime: cfg.start_time,
        endTime: cfg.end_time,
        allowedAttempts: allowed,
        remainingAttempts,
        resetFrequency: cfg.reset_frequency,
        questionsPerPlay: cfg.questions_per_play || game.defaultQuestionsCount,
        pointsPerQuestion: cfg.points_per_question || 20,
        completionBonusPoints: cfg.completion_bonus_points || 50,
        maxPossiblePoints: (cfg.questions_per_play || game.defaultQuestionsCount) * (cfg.points_per_question || 20) + (cfg.completion_bonus_points || 50),
        stats: playStats
      };
    }));

    res.json({
      success: true,
      games: result,
      studentPoints: req.user.points || 0
    });
  } catch (err) {
    console.error('[events /list]', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── 2. POST /api/events/:gameId/start — Start a game session and get dynamic questions
router.post('/:gameId/start', requireRole('student'), async (req, res) => {
  const { gameId } = req.params;
  const studentId = req.user.id;
  const teacherId = req.user.teacher_id;
  const studentStage = req.user.academic_stage || '';

  try {
    const normalizedGameId = gameId === 'weekly-run' ? 'stickman_run' : gameId;
    const gameDef = GAME_CATALOG.find(g => g.id === normalizedGameId);
    if (!gameDef) {
      return res.status(404).json({ error: 'اللعبة المطلوبة غير موجودة' });
    }

    // Get teacher config
    const { rows: cfgs } = await pool.query(
      `SELECT * FROM teacher_game_events WHERE teacher_id = $1 AND game_id = $2`,
      [teacherId, normalizedGameId]
    );
    const cfg = cfgs[0] || {
      is_enabled: true,
      points_per_question: 20,
      completion_bonus_points: 50,
      allowed_attempts: 0,
      reset_frequency: 'weekly',
      question_pull_mode: 'unseen_first',
      questions_per_play: gameDef.defaultQuestionsCount,
      start_time: null,
      end_time: null
    };

    if (cfg.is_enabled === false) {
      return res.status(403).json({ error: 'هذه الفعالية غير مفعلة حالياً من قِبل المعلم' });
    }

    const now = new Date();
    if (cfg.start_time && new Date(cfg.start_time) > now) {
      return res.status(403).json({ error: 'لم يحن موعد فتح هذه الفعالية بعد' });
    }
    if (cfg.end_time && new Date(cfg.end_time) < now) {
      return res.status(403).json({ error: 'انتهت فترة هذه الفعالية' });
    }

    // Check attempts
    const allowed = parseInt(cfg.allowed_attempts, 10) || 0;
    if (allowed > 0) {
      const periodStart = getPeriodStart(cfg.reset_frequency, now);
      const { rows: pRows } = await pool.query(
        `SELECT COUNT(*)::int AS count FROM game_plays_history
         WHERE student_id = $1 AND game_id = $2 AND played_at >= $3`,
        [studentId, normalizedGameId, periodStart.toISOString()]
      );
      if ((pRows[0]?.count || 0) >= allowed) {
        return res.status(403).json({ error: 'استنفدت جميع محاولاتك المتاحة لهذه الفترة' });
      }
    }

    // Question Selection Engine
    const questionsCount = Math.max(1, Math.min(20, parseInt(cfg.questions_per_play, 10) || gameDef.defaultQuestionsCount));
    const pullMode = cfg.question_pull_mode || 'unseen_first';

    // Fetch teacher questions for this game and stage
    const { rows: teacherQuestions } = await pool.query(
      `SELECT id, question_text, question_image, choices, correct_index, time_limit_sec, explanation, enemy_label, level_number
       FROM game_questions
       WHERE teacher_id = $1
         AND is_active = true
         AND (game_id = $2 OR game_id IS NULL)
         AND (academic_stage = $3 OR academic_stage = 'جميع المراحل' OR academic_stage IS NULL)
       ORDER BY level_number ASC, RANDOM()`,
      [teacherId, normalizedGameId, studentStage]
    );

    let selectedQuestions = [];

    if (teacherQuestions.length > 0) {
      if (pullMode === 'unseen_first' && allowed > 0) {
        // Find seen questions in past history
        const periodStart = getPeriodStart(cfg.reset_frequency, now);
        const { rows: history } = await pool.query(
          `SELECT seen_question_ids FROM game_plays_history
           WHERE student_id = $1 AND game_id = $2 AND played_at >= $3
           ORDER BY played_at DESC`,
          [studentId, normalizedGameId, periodStart.toISOString()]
        );
        const seenSet = new Set();
        history.forEach(h => {
          if (Array.isArray(h.seen_question_ids)) {
            h.seen_question_ids.forEach(id => seenSet.add(id));
          }
        });

        const unseen = teacherQuestions.filter(q => !seenSet.has(q.id));
        const seen = teacherQuestions.filter(q => seenSet.has(q.id));
        selectedQuestions = [...unseen, ...seen].slice(0, questionsCount);
      } else {
        selectedQuestions = [...teacherQuestions].sort(() => Math.random() - 0.5).slice(0, questionsCount);
      }
    }

    // Fallback enrichment with default questions if needed
    if (selectedQuestions.length < questionsCount) {
      const fallbackPool = DEFAULT_STAGE_QUESTIONS[studentStage] || DEFAULT_STAGE_QUESTIONS['general'];
      const needed = questionsCount - selectedQuestions.length;
      const shuffledFallback = [...fallbackPool].sort(() => Math.random() - 0.5).slice(0, needed);
      shuffledFallback.forEach((fq, idx) => {
        selectedQuestions.push({
          id: -1 * (idx + 1), // Virtual ID for fallback
          question_text: fq.question_text,
          question_image: null,
          choices: fq.choices,
          correct_index: fq.correct_index,
          time_limit_sec: 45,
          explanation: fq.explanation || null,
          enemy_label: fq.enemy_label || `المرحلة ${selectedQuestions.length + 1}`,
          level_number: fq.level_number || (selectedQuestions.length + 1)
        });
      });
    }

    // Generate secure game session token
    const token = crypto.randomBytes(32).toString('hex');
    const ptsPerQ = parseInt(cfg.points_per_question, 10) || 20;
    const bonusPts = parseInt(cfg.completion_bonus_points, 10) || 50;
    const maxAllowedPoints = (selectedQuestions.length * ptsPerQ) + bonusPts;

    const sessionPayload = {
      studentId,
      teacherId,
      gameId: normalizedGameId,
      questions: selectedQuestions,
      ptsPerQ,
      bonusPts,
      maxAllowedPoints,
      createdAt: Date.now()
    };

    // Clean up old tokens for this student/game and insert new with session_data
    await pool.query(
      `DELETE FROM game_session_tokens WHERE student_id = $1 AND event_id = $2`,
      [studentId, normalizedGameId]
    );
    await pool.query(
      `INSERT INTO game_session_tokens (student_id, token, event_id, session_data) VALUES ($1, $2, $3, $4)`,
      [studentId, token, normalizedGameId, JSON.stringify(sessionPayload)]
    );

    // Save questions in in-memory session for quick lookup
    _activeGameSessions.set(token, sessionPayload);

    // Sanitize question list for client (OMIT correct_index and explanation)
    const clientQuestions = selectedQuestions.map((q, idx) => {
      const choices = Array.isArray(q.choices) ? q.choices : (typeof q.choices === 'string' ? JSON.parse(q.choices) : []);
      return {
        id: q.id,
        index: idx,
        questionText: q.question_text,
        questionImage: q.question_image,
        choices: choices,
        timeLimit: q.time_limit_sec || 45,
        enemyLabel: q.enemy_label || `تحدي ${idx + 1}`,
        levelNumber: q.level_number || (idx + 1)
      };
    });

    res.json({
      success: true,
      sessionToken: token,
      gameId: normalizedGameId,
      gameTitle: cfg.title || gameDef.title,
      questions: clientQuestions,
      pointsPerQuestion: ptsPerQ,
      completionBonusPoints: bonusPts
    });
  } catch (err) {
    console.error('[events /start]', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── 3. POST /api/events/:gameId/finish — Complete game and award verified points
router.post('/:gameId/finish', requireRole('student'), async (req, res) => {
  const { gameId } = req.params;
  const { sessionToken, answers = [], completed = false, rawScore = 0 } = req.body;
  const studentId = req.user.id;
  const normalizedGameId = gameId === 'weekly-run' ? 'stickman_run' : gameId;

  if (!sessionToken) {
    return res.status(400).json({ error: 'رمز الجلسة مطلوب للتحقق من النتيجة' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Verify and lock session token from DB
    const tokenCheck = await client.query(
      `SELECT id, session_data FROM game_session_tokens
       WHERE token = $1 AND student_id = $2 AND event_id = $3
         AND used_at IS NULL AND created_at > NOW() - INTERVAL '2 hours'
       FOR UPDATE`,
      [sessionToken, studentId, normalizedGameId]
    );

    if (!tokenCheck.rows.length) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'رمز جلسة اللعبة غير صالح أو منتهي الصلاحية' });
    }

    // Mark token as used immediately
    await client.query(
      `UPDATE game_session_tokens SET used_at = NOW() WHERE id = $1`,
      [tokenCheck.rows[0].id]
    );

    // 2. Retrieve session from memory or DB payload
    const memSession = _activeGameSessions.get(sessionToken);
    const dbSession = tokenCheck.rows[0].session_data || {};
    const sessionData = memSession || dbSession;

    let calculatedPoints = 0;
    let correctCount = 0;
    let questionsAsked = 0;
    const seenQuestionIds = [];

    if (sessionData && Array.isArray(sessionData.questions) && sessionData.questions.length > 0) {
      questionsAsked = sessionData.questions.length;
      sessionData.questions.forEach((q, idx) => {
        if (q.id > 0) seenQuestionIds.push(q.id);
        const submitted = Array.isArray(answers) ? answers.find(a => a.questionIndex === idx || a.questionId === q.id) : null;
        if (submitted && Number(submitted.selectedIndex) === Number(q.correct_index)) {
          correctCount++;
        }
      });

      const ptsPerQ = parseInt(sessionData.ptsPerQ, 10) || 20;
      const bonusPts = parseInt(sessionData.bonusPts, 10) || 50;
      calculatedPoints = correctCount * ptsPerQ;
      if (completed && correctCount === questionsAsked) {
        calculatedPoints += bonusPts;
      }
      calculatedPoints = Math.min(calculatedPoints, sessionData.maxAllowedPoints || 1000);
    } else {
      // Fallback: strictly zero unverified points
      calculatedPoints = 0;
      correctCount = 0;
      questionsAsked = 0;
    }

    // Clean memory
    _activeGameSessions.delete(sessionToken);

    // 3. Record into game_plays_history & event_plays
    await client.query(
      `INSERT INTO game_plays_history
         (student_id, teacher_id, game_id, session_token, score, points_earned, questions_asked, questions_correct, completed, seen_question_ids)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        studentId,
        req.user.teacher_id,
        normalizedGameId,
        sessionToken,
        parseInt(rawScore, 10) || (correctCount * 100),
        calculatedPoints,
        questionsAsked,
        correctCount,
        completed === true,
        JSON.stringify(seenQuestionIds)
      ]
    );

    await client.query(
      `INSERT INTO event_plays (student_id, event_id, score, completed)
       VALUES ($1, $2, $3, $4)`,
      [studentId, normalizedGameId, calculatedPoints, completed === true]
    );

    // 4. Update student points atomically
    if (calculatedPoints > 0) {
      await client.query(
        `UPDATE students SET points = points + $1 WHERE id = $2`,
        [calculatedPoints, studentId]
      );
    }

    await client.query('COMMIT');

    const { rows: studentRows } = await pool.query(
      `SELECT points FROM students WHERE id = $1`,
      [studentId]
    );

    res.json({
      success: true,
      pointsEarned: calculatedPoints,
      correctCount,
      questionsAsked,
      completed: completed === true,
      newTotalPoints: studentRows[0]?.points || 0
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[events /finish]', err.message);
    res.status(500).json({ error: 'Server error' });
  } finally {
    client.release();
  }
});

// ── 4. GET /api/events/:gameId/leaderboard — Leaderboard per game
router.get('/:gameId/leaderboard', requireRole('student', 'teacher', 'assistant'), async (req, res) => {
  const { gameId } = req.params;
  const teacherId = getTeacherId(req);
  const normalizedGameId = gameId === 'weekly-run' ? 'stickman_run' : gameId;

  try {
    const { rows } = await pool.query(
      `SELECT s.id, s.name, s.username, s.academic_stage,
              MAX(gph.score) AS high_score,
              SUM(gph.points_earned)::int AS total_points_earned,
              COUNT(gph.id)::int AS play_count
       FROM game_plays_history gph
       JOIN students s ON gph.student_id = s.id
       WHERE gph.teacher_id = $1 AND gph.game_id = $2
         AND s.deleted_at IS NULL AND s.is_simulation IS NOT TRUE
       GROUP BY s.id, s.name, s.username, s.academic_stage
       ORDER BY high_score DESC, total_points_earned DESC
       LIMIT 15`,
      [teacherId, normalizedGameId]
    );
    res.json(rows);
  } catch (err) {
    console.error('[events /leaderboard]', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// ── TEACHER & ASSISTANT MANAGEMENT ENDPOINTS ─────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

// ── 5. GET /api/events/teacher/config — Get all games configuration
router.get('/teacher/config', requireRole('teacher', 'assistant'), checkManageEventsPerm, async (req, res) => {
  const teacherId = getTeacherId(req);
  try {
    const { rows } = await pool.query(
      `SELECT * FROM teacher_game_events WHERE teacher_id = $1`,
      [teacherId]
    );
    const map = new Map();
    rows.forEach(r => map.set(r.game_id, r));

    const result = GAME_CATALOG.map(game => {
      const custom = map.get(game.id) || {};
      return {
        ...game,
        title: custom.title || game.title,
        description: custom.description || game.subtitle,
        is_enabled: custom.is_enabled !== false,
        points_per_question: custom.points_per_question ?? 20,
        completion_bonus_points: custom.completion_bonus_points ?? 50,
        allowed_attempts: custom.allowed_attempts ?? 0,
        reset_frequency: custom.reset_frequency || 'weekly',
        question_pull_mode: custom.question_pull_mode || 'unseen_first',
        questions_per_play: custom.questions_per_play || game.defaultQuestionsCount,
        start_time: custom.start_time ? formatEgyptDateTime(custom.start_time) : null,
        end_time: custom.end_time ? formatEgyptDateTime(custom.end_time) : null,
        target_stages: custom.target_stages || []
      };
    });

    res.json(result);
  } catch (err) {
    console.error('[events /teacher/config]', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── 6. PUT /api/events/teacher/config/:gameId — Update game configuration
router.put('/teacher/config/:gameId', requireRole('teacher', 'assistant'), checkManageEventsPerm, async (req, res) => {
  const teacherId = getTeacherId(req);
  const { gameId } = req.params;
  const {
    title, description, is_enabled, points_per_question, completion_bonus_points,
    allowed_attempts, reset_frequency, question_pull_mode, questions_per_play,
    start_time, end_time, target_stages
  } = req.body;

  try {
    const parsedStart = start_time ? parseEgyptDateTimeToUTC(start_time) : null;
    const parsedEnd = end_time ? parseEgyptDateTimeToUTC(end_time) : null;

    const result = await pool.query(
      `INSERT INTO teacher_game_events
         (teacher_id, game_id, title, description, is_enabled, points_per_question,
          completion_bonus_points, allowed_attempts, reset_frequency, question_pull_mode,
          questions_per_play, start_time, end_time, target_stages, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW())
       ON CONFLICT (teacher_id, game_id) DO UPDATE SET
         title = EXCLUDED.title,
         description = EXCLUDED.description,
         is_enabled = EXCLUDED.is_enabled,
         points_per_question = EXCLUDED.points_per_question,
         completion_bonus_points = EXCLUDED.completion_bonus_points,
         allowed_attempts = EXCLUDED.allowed_attempts,
         reset_frequency = EXCLUDED.reset_frequency,
         question_pull_mode = EXCLUDED.question_pull_mode,
         questions_per_play = EXCLUDED.questions_per_play,
         start_time = EXCLUDED.start_time,
         end_time = EXCLUDED.end_time,
         target_stages = EXCLUDED.target_stages,
         updated_at = NOW()
       RETURNING *`,
      [
        teacherId,
        gameId,
        title || null,
        description || null,
        is_enabled !== false,
        Math.max(0, parseInt(points_per_question, 10) || 20),
        Math.max(0, parseInt(completion_bonus_points, 10) || 50),
        Math.max(0, parseInt(allowed_attempts, 10) || 0),
        reset_frequency || 'weekly',
        question_pull_mode || 'unseen_first',
        Math.max(1, Math.min(20, parseInt(questions_per_play, 10) || 3)),
        parsedStart,
        parsedEnd,
        JSON.stringify(Array.isArray(target_stages) ? target_stages : [])
      ]
    );

    res.json(result.rows[0]);
  } catch (err) {
    console.error('[events /teacher/config/:gameId]', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── 7. GET /api/events/teacher/questions — List game questions with filters
router.get('/teacher/questions', requireRole('teacher', 'assistant'), checkManageEventsPerm, async (req, res) => {
  const teacherId = getTeacherId(req);
  const { game_id, academic_stage, level_number, search } = req.query;

  try {
    let query = `
      SELECT id, teacher_id, game_id, academic_stage, level_number,
             question_text, question_image, choices, correct_index,
             time_limit_sec, explanation, enemy_label, is_active, created_at
      FROM game_questions
      WHERE teacher_id = $1
    `;
    const params = [teacherId];

    if (game_id && game_id !== 'all') {
      params.push(game_id);
      query += ` AND (game_id = $${params.length} OR game_id IS NULL)`;
    }
    if (academic_stage && academic_stage !== 'all') {
      params.push(academic_stage);
      query += ` AND (academic_stage = $${params.length} OR academic_stage = 'جميع المراحل')`;
    }
    if (level_number && level_number !== 'all') {
      params.push(parseInt(level_number, 10));
      query += ` AND level_number = $${params.length}`;
    }
    if (search && search.trim()) {
      params.push(`%${search.trim()}%`);
      query += ` AND question_text ILIKE $${params.length}`;
    }

    query += ` ORDER BY created_at DESC`;

    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    console.error('[events /teacher/questions]', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── 8. POST /api/events/teacher/questions — Create a game question
router.post('/teacher/questions', requireRole('teacher', 'assistant'), checkManageEventsPerm, async (req, res) => {
  const teacherId = getTeacherId(req);
  const {
    game_id, academic_stage, level_number, question_text, question_image,
    choices, correct_index, time_limit_sec, explanation, enemy_label
  } = req.body;

  if (!question_text || !question_text.trim()) {
    return res.status(400).json({ error: 'نص السؤال مطلوب' });
  }
  if (!Array.isArray(choices) || choices.length < 2) {
    return res.status(400).json({ error: 'يجب توفير اختيارين على الأقل' });
  }

  const sanitizedCorrect = Math.max(0, Math.min(choices.length - 1, parseInt(correct_index, 10) || 0));

  try {
    const { rows } = await pool.query(
      `INSERT INTO game_questions
         (teacher_id, game_id, academic_stage, level_number, question_text,
          question_image, choices, correct_index, time_limit_sec, explanation, enemy_label)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING *`,
      [
        teacherId,
        game_id && game_id !== 'all' ? game_id : null,
        academic_stage || 'جميع المراحل',
        Math.max(1, Math.min(5, parseInt(level_number, 10) || 1)),
        question_text.trim(),
        question_image || null,
        JSON.stringify(choices),
        sanitizedCorrect,
        Math.max(10, Math.min(180, parseInt(time_limit_sec, 10) || 45)),
        explanation || null,
        enemy_label || null
      ]
    );

    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('[events /teacher/questions POST]', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── 9. PUT /api/events/teacher/questions/:id — Update a game question
router.put('/teacher/questions/:id', requireRole('teacher', 'assistant'), checkManageEventsPerm, async (req, res) => {
  const teacherId = getTeacherId(req);
  const questionId = parseInt(req.params.id, 10);
  const {
    game_id, academic_stage, level_number, question_text, question_image,
    choices, correct_index, time_limit_sec, explanation, enemy_label, is_active
  } = req.body;

  if (!question_text || !question_text.trim()) {
    return res.status(400).json({ error: 'نص السؤال مطلوب' });
  }
  if (!Array.isArray(choices) || choices.length < 2) {
    return res.status(400).json({ error: 'يجب توفير اختيارين على الأقل' });
  }

  const sanitizedCorrect = Math.max(0, Math.min(choices.length - 1, parseInt(correct_index, 10) || 0));

  try {
    const { rows } = await pool.query(
      `UPDATE game_questions
       SET game_id = $1,
           academic_stage = $2,
           level_number = $3,
           question_text = $4,
           question_image = $5,
           choices = $6,
           correct_index = $7,
           time_limit_sec = $8,
           explanation = $9,
           enemy_label = $10,
           is_active = $11
       WHERE id = $12 AND teacher_id = $13
       RETURNING *`,
      [
        game_id && game_id !== 'all' ? game_id : null,
        academic_stage || 'جميع المراحل',
        Math.max(1, Math.min(5, parseInt(level_number, 10) || 1)),
        question_text.trim(),
        question_image || null,
        JSON.stringify(choices),
        sanitizedCorrect,
        Math.max(10, Math.min(180, parseInt(time_limit_sec, 10) || 45)),
        explanation || null,
        enemy_label || null,
        is_active !== false,
        questionId,
        teacherId
      ]
    );

    if (!rows.length) {
      return res.status(404).json({ error: 'السؤال غير موجود أو غير تابع لك' });
    }

    res.json(rows[0]);
  } catch (err) {
    console.error('[events /teacher/questions PUT]', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── 10. DELETE /api/events/teacher/questions/:id — Delete a game question
router.delete('/teacher/questions/:id', requireRole('teacher', 'assistant'), checkManageEventsPerm, async (req, res) => {
  const teacherId = getTeacherId(req);
  const questionId = parseInt(req.params.id, 10);

  try {
    const { rowCount } = await pool.query(
      `DELETE FROM game_questions WHERE id = $1 AND teacher_id = $2`,
      [questionId, teacherId]
    );

    if (!rowCount) {
      return res.status(404).json({ error: 'السؤال غير موجود' });
    }

    res.json({ success: true, message: 'تم حذف السؤال بنجاح' });
  } catch (err) {
    console.error('[events /teacher/questions DELETE]', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── 11. POST /api/events/teacher/questions/seed-defaults — Populate default questions
router.post('/teacher/questions/seed-defaults', requireRole('teacher', 'assistant'), checkManageEventsPerm, async (req, res) => {
  const teacherId = getTeacherId(req);
  const { academic_stage = 'جميع المراحل' } = req.body;

  try {
    const poolQuestions = DEFAULT_STAGE_QUESTIONS[academic_stage] || DEFAULT_STAGE_QUESTIONS['general'];
    let insertedCount = 0;

    for (const q of poolQuestions) {
      await pool.query(
        `INSERT INTO game_questions
           (teacher_id, game_id, academic_stage, level_number, question_text, choices, correct_index, time_limit_sec, enemy_label)
         VALUES ($1, NULL, $2, $3, $4, $5, $6, 45, $7)`,
        [
          teacherId,
          academic_stage,
          q.level_number || 1,
          q.question_text,
          JSON.stringify(q.choices),
          q.correct_index || 0,
          q.enemy_label || 'زعيم المعرفة'
        ]
      );
      insertedCount++;
    }

    res.json({ success: true, insertedCount });
  } catch (err) {
    console.error('[events /teacher/questions/seed-defaults]', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── 12. GET /api/events/teacher/analytics — Gamification analytics & statistics
router.get('/teacher/analytics', requireRole('teacher', 'assistant'), checkManageEventsPerm, async (req, res) => {
  const teacherId = getTeacherId(req);

  try {
    // 1. Overall stats
    const { rows: overallRows } = await pool.query(
      `SELECT COUNT(id)::int AS total_plays,
              COUNT(DISTINCT student_id)::int AS unique_students,
              COALESCE(SUM(points_earned), 0)::int AS total_points_awarded,
              COALESCE(AVG(score), 0)::int AS avg_score,
              ROUND(COALESCE(AVG(CASE WHEN completed THEN 100.0 ELSE 0.0 END), 0), 1) AS completion_rate
       FROM game_plays_history
       WHERE teacher_id = $1`,
      [teacherId]
    );

    // 2. Stats per game
    const { rows: perGameRows } = await pool.query(
      `SELECT game_id,
              COUNT(id)::int AS plays_count,
              COUNT(DISTINCT student_id)::int AS students_count,
              COALESCE(SUM(points_earned), 0)::int AS points_awarded,
              COALESCE(MAX(score), 0) AS high_score,
              ROUND(COALESCE(AVG(CASE WHEN completed THEN 100.0 ELSE 0.0 END), 0), 1) AS completion_rate
       FROM game_plays_history
       WHERE teacher_id = $1
       GROUP BY game_id`,
      [teacherId]
    );

    // 3. Top student performers across games
    const { rows: topStudents } = await pool.query(
      `SELECT s.id, s.name, s.academic_stage, s.points AS current_points,
              COALESCE(SUM(gph.points_earned), 0)::int AS total_game_points,
              COUNT(gph.id)::int AS games_played,
              MAX(gph.score) AS highest_game_score
       FROM game_plays_history gph
       JOIN students s ON gph.student_id = s.id
       WHERE gph.teacher_id = $1
         AND s.deleted_at IS NULL AND s.is_simulation IS NOT TRUE
       GROUP BY s.id, s.name, s.academic_stage, s.points
       ORDER BY total_game_points DESC, highest_game_score DESC
       LIMIT 10`,
      [teacherId]
    );

    // 4. Recent game activity stream
    const { rows: recentPlays } = await pool.query(
      `SELECT gph.id, gph.game_id, gph.score, gph.points_earned,
              gph.questions_correct, gph.questions_asked, gph.completed, gph.played_at,
              s.name AS student_name, s.academic_stage
       FROM game_plays_history gph
       JOIN students s ON gph.student_id = s.id
       WHERE gph.teacher_id = $1
       ORDER BY gph.played_at DESC
       LIMIT 15`,
      [teacherId]
    );

    res.json({
      overall: overallRows[0] || {},
      perGame: perGameRows,
      topStudents,
      recentPlays
    });
  } catch (err) {
    console.error('[events /teacher/analytics]', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
