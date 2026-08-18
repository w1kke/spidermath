// Question picking for Spider-Math — draws a random round from the 100-exercise pools.
window.SpiderQuestions = (() => {
  'use strict';

  function shuffled(arr) {
    const out = [...arr];
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }

  function getPool(grade) {
    const pool = (window.SPIDERMATH_DATA || {})[`grade${grade}`];
    if (!Array.isArray(pool) || pool.length === 0) {
      throw new Error(`No question data found for grade ${grade}`);
    }
    return pool;
  }

  // Returns `count` distinct questions: { text, answer, choices } with choices
  // freshly shuffled so replays put answers on different buildings.
  function pickRound(grade, count) {
    return shuffled(getPool(grade))
      .slice(0, count)
      .map(({ q, a, c }) => ({
        text: `${q} = ?`,
        answer: a,
        choices: shuffled(c),
      }));
  }

  return { getPool, pickRound };
})();
