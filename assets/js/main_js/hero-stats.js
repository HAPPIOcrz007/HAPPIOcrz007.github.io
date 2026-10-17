/* hero-stats.js — fills the hero stat boxes from the activity heatmap numbers. */

/* ================================================================
   UPDATE HERO STATS FROM HEATMAP
================================================================ */
export function updateHeroStatsFromHeatmap(stats) {
  if (!stats) return;

  // Update Codeforces Rating
  const cfStat = document.querySelector('[data-stat-id="codeforces-rating"] .stat-value');
  if (cfStat && stats.cfRating !== undefined && stats.cfRating !== null) {
    // Get rank from rating
    let rank = 'Newbie';
    if (stats.cfRating >= 2900) rank = 'Legendary Grandmaster';
    else if (stats.cfRating >= 2600) rank = 'International Grandmaster';
    else if (stats.cfRating >= 2400) rank = 'Grandmaster';
    else if (stats.cfRating >= 2300) rank = 'International Master';
    else if (stats.cfRating >= 2100) rank = 'Master';
    else if (stats.cfRating >= 1900) rank = 'Candidate Master';
    else if (stats.cfRating >= 1600) rank = 'Expert';
    else if (stats.cfRating >= 1400) rank = 'Specialist';
    else if (stats.cfRating >= 1200) rank = 'Pupil';
    else rank = 'Newbie';

    cfStat.textContent = `${stats.cfRating} - ${rank}`;
    const parent = cfStat.closest('.stat');
    if (parent) parent.classList.add('reveal', 'visible');
  }

  // Update GitHub Commits
  const ghStat = document.querySelector('[data-stat-id="github-commits"] .stat-value');
  if (ghStat) {
    ghStat.textContent = stats.githubTotal.toLocaleString();
    const parent = ghStat.closest('.stat');
    if (parent) parent.classList.add('reveal', 'visible');
  }

  // Update Problems Solved (CF + LC + AC)
  const psStat = document.querySelector('[data-stat-id="problems-solved"] .stat-value');
  if (psStat) {
    const total = stats.cfTotal + stats.lcTotal + stats.acTotal;
    psStat.textContent = total.toLocaleString();
    const parent = psStat.closest('.stat');
    if (parent) parent.classList.add('reveal', 'visible');
  }
}
