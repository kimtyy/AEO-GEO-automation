// js/charts.js - Chart.js 초기화 및 업데이트

let radarChartInstance = null;
let barChartInstance = null;
let qarelRadarChartInstance = null;
let qarelBarChartInstance = null;
let weeklyTrendChartInstance = null;   // Phase 2
let miniTrendChartInstance = null;     // Phase 5
let nicheRadarChartInstance = null;    // Phase 5
let competitorCompareChartInstance = null; // Phase 5

const chartService = {
    initCharts() {
        this.initRadarChart();
        this.initBarChart();
        this.initQarelRadarChart();
        this.initQarelBarChart();
        this.initWeeklyTrendChart();    // Phase 2
        this.initMiniTrendChart();      // Phase 5
        this.initNicheRadarChart();     // Phase 5
        this.initCompetitorCompareChart(); // Phase 5
    },

    initRadarChart() {
        const ctx = document.getElementById('radarChart');
        if (!ctx) return;

        radarChartInstance = new Chart(ctx, {
            type: 'radar',
            data: {
                labels: ['가시성', '정확도', '긍정감성', '최신성', '경쟁우위'],
                datasets: [{
                    label: '현재 지수',
                    data: [85, 70, 90, 60, 80],
                    backgroundColor: 'rgba(24, 95, 165, 0.2)',
                    borderColor: 'rgba(24, 95, 165, 1)',
                    pointBackgroundColor: 'rgba(24, 95, 165, 1)',
                    borderWidth: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    r: {
                        angleLines: { display: true },
                        suggestedMin: 0,
                        suggestedMax: 100
                    }
                }
            }
        });
    },

    initBarChart() {
        const ctx = document.getElementById('barChart');
        if (!ctx) return;

        barChartInstance = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: ['Claude', 'ChatGPT', 'Gemini'],
                datasets: [{
                    label: '언급률 (%)',
                    data: [0, 0, 0],
                    backgroundColor: ['#185FA5', '#3B6D11', '#854F0B'],
                    borderWidth: 0,
                    borderRadius: 4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: { y: { beginAtZero: true, max: 100 } },
                plugins: { legend: { display: false } }
            }
        });
    },

    updateCharts(newData) {
        if (radarChartInstance && newData.radar) {
            radarChartInstance.data.datasets[0].data = newData.radar;
            radarChartInstance.update();
        }
        if (barChartInstance && newData.bar) {
            barChartInstance.data.datasets[0].data = newData.bar;
            barChartInstance.update();
        }
    },

    initQarelRadarChart() {
        const ctx = document.getElementById('qarelRadarChart');
        if (!ctx) return;

        qarelRadarChartInstance = new Chart(ctx, {
            type: 'radar',
            data: {
                labels: ['Q (질문)', 'A (답변)', 'R (리뷰)', 'E (전문성)', 'L (지역성)'],
                datasets: [{
                    label: '현재 지수',
                    data: [0, 0, 0, 0, 0],
                    backgroundColor: 'rgba(24, 95, 165, 0.2)',
                    borderColor: 'rgba(24, 95, 165, 1)',
                    pointBackgroundColor: 'rgba(24, 95, 165, 1)',
                    borderWidth: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    r: { angleLines: { display: true }, suggestedMin: 0, suggestedMax: 100 }
                }
            }
        });
    },

    initQarelBarChart() {
        const ctx = document.getElementById('qarelBarChart');
        if (!ctx) return;

        qarelBarChartInstance = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: ['Q (질문)', 'A (답변)', 'R (리뷰)', 'E (전문성)', 'L (지역성)'],
                datasets: [{
                    label: '점수',
                    data: [0, 0, 0, 0, 0],
                    backgroundColor: ['#185FA5', '#3B6D11', '#854F0B', '#607d8b', '#9e9e9e'],
                    borderWidth: 0,
                    borderRadius: 4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: { y: { beginAtZero: true, max: 100 } },
                plugins: { legend: { display: false } }
            }
        });
    },

    updateQarelCharts(qarelData) {
        if (qarelRadarChartInstance && qarelData) {
            qarelRadarChartInstance.data.datasets[0].data = qarelData;
            qarelRadarChartInstance.update();
        }
        if (qarelBarChartInstance && qarelData) {
            qarelBarChartInstance.data.datasets[0].data = qarelData;
            qarelBarChartInstance.update();
        }
    },

    // ── Phase 2: 주간 추세 차트 (신뢰구간 밴드 포함) ─────────────

    initWeeklyTrendChart() {
        const ctx = document.getElementById('weeklyTrendChart');
        if (!ctx) return;

        // 데이터셋 순서 (AI별 3개: upper / lower / main)
        // upper: fill '+1' → lower까지 채워 CI 밴드 시각화
        const mk = (label, rgb, type) => {
            if (type === 'upper') return {
                label: `_${label}_upper`, data: [], tension: 0.3, pointRadius: 0,
                borderColor: 'transparent',
                backgroundColor: `rgba(${rgb}, 0.12)`, fill: '+1'
            };
            if (type === 'lower') return {
                label: `_${label}_lower`, data: [], tension: 0.3, pointRadius: 0,
                borderColor: `rgba(${rgb}, 0.35)`, borderDash: [4, 3], borderWidth: 1,
                backgroundColor: 'transparent', fill: false
            };
            return {                              // main line
                label, data: [], tension: 0.3,
                borderColor: `rgb(${rgb})`, borderWidth: 2,
                backgroundColor: 'transparent', fill: false,
                pointRadius: 4, pointHoverRadius: 6,
                pointBackgroundColor: `rgb(${rgb})`
            };
        };

        weeklyTrendChartInstance = new Chart(ctx, {
            type: 'line',
            data: {
                labels: [],
                datasets: [
                    mk('Claude',  '24,95,165',  'upper'),
                    mk('Claude',  '24,95,165',  'lower'),
                    mk('Claude',  '24,95,165',  'main'),
                    mk('ChatGPT', '59,109,17',  'upper'),
                    mk('ChatGPT', '59,109,17',  'lower'),
                    mk('ChatGPT', '59,109,17',  'main'),
                    mk('Gemini',  '133,79,11',  'upper'),
                    mk('Gemini',  '133,79,11',  'lower'),
                    mk('Gemini',  '133,79,11',  'main'),
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true, max: 100,
                        ticks: { callback: v => v + '%' }
                    }
                },
                plugins: {
                    legend: {
                        labels: { filter: item => !item.text.startsWith('_') }
                    },
                    tooltip: {
                        filter: item => !item.dataset.label.startsWith('_'),
                        callbacks: {
                            label: ctx => {
                                if (ctx.dataset.label.startsWith('_')) return null;
                                const v = ctx.parsed.y;
                                return ` ${ctx.dataset.label}: ${v != null ? v + '%' : '—'}`;
                            }
                        }
                    }
                }
            }
        });
    },

    /**
     * 주간 추세 차트 업데이트
     * @param {Array} summaries - monitoring_summaries rows (최근 8주 × 3 AI)
     */
    updateWeeklyTrendChart(summaries) {
        if (!weeklyTrendChartInstance) return;

        if (!summaries || summaries.length === 0) {
            weeklyTrendChartInstance.data.labels = ['데이터 없음'];
            weeklyTrendChartInstance.data.datasets.forEach(ds => ds.data = [null]);
            weeklyTrendChartInstance.update();
            return;
        }

        const weekSet = [...new Set(summaries.map(s => s.week))].sort();
        const last8 = weekSet.slice(-8);

        const labels = last8.map(w => {
            const d = new Date(w + 'T00:00:00');
            return `${d.getMonth() + 1}/${d.getDate()}`;
        });

        const pick = (ai, field) => last8.map(w => {
            const row = summaries.find(s => s.week === w && s.ai_type === ai);
            return row != null ? Number(row[field]) : null;
        });

        const ds = weeklyTrendChartInstance.data.datasets;
        // 인덱스: 0=_claude_upper, 1=_claude_lower, 2=Claude
        //         3=_chatgpt_upper, 4=_chatgpt_lower, 5=ChatGPT
        //         6=_gemini_upper, 7=_gemini_lower, 8=Gemini
        ds[0].data = pick('claude',  'ci_upper');
        ds[1].data = pick('claude',  'ci_lower');
        ds[2].data = pick('claude',  'mention_rate');
        ds[3].data = pick('chatgpt', 'ci_upper');
        ds[4].data = pick('chatgpt', 'ci_lower');
        ds[5].data = pick('chatgpt', 'mention_rate');
        ds[6].data = pick('gemini',  'ci_upper');
        ds[7].data = pick('gemini',  'ci_lower');
        ds[8].data = pick('gemini',  'mention_rate');

        weeklyTrendChartInstance.data.labels = labels;
        weeklyTrendChartInstance.update();
    },

    // ── Phase 5: 신규 차트 초기화 및 업데이트 ───────────────────

    initMiniTrendChart() {
        const ctx = document.getElementById('miniTrendChart');
        if (!ctx) return;

        miniTrendChartInstance = new Chart(ctx, {
            type: 'line',
            data: {
                labels: [],
                datasets: [{
                    data: [],
                    borderColor: '#3B6D11',
                    borderWidth: 1.5,
                    tension: 0.4,
                    pointRadius: 0,
                    fill: false
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: { display: false },
                    y: { display: false, min: 0, max: 100 }
                },
                plugins: {
                    legend: { display: false },
                    tooltip: { enabled: false }
                }
            }
        });
    },

    updateMiniTrendChart(labels, dataPoints) {
        if (!miniTrendChartInstance) return;
        miniTrendChartInstance.data.labels = labels;
        miniTrendChartInstance.data.datasets[0].data = dataPoints;
        miniTrendChartInstance.update();
    },

    initNicheRadarChart() {
        const ctx = document.getElementById('nicheRadarChart');
        if (!ctx) return;

        nicheRadarChartInstance = new Chart(ctx, {
            type: 'radar',
            data: {
                labels: [],
                datasets: [{
                    label: '적합도 점수',
                    data: [],
                    backgroundColor: 'rgba(24, 95, 165, 0.15)',
                    borderColor: 'rgba(24, 95, 165, 1)',
                    pointBackgroundColor: 'rgba(24, 95, 165, 1)',
                    borderWidth: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    r: { angleLines: { display: true }, suggestedMin: 0, suggestedMax: 100 }
                }
            }
        });
        window.nicheRadarChartInstance = nicheRadarChartInstance;
    },

    updateNicheRadarChart(labels, scores) {
        if (!nicheRadarChartInstance) return;
        nicheRadarChartInstance.data.labels = labels;
        nicheRadarChartInstance.data.datasets[0].data = scores;
        nicheRadarChartInstance.update();
    },

    initCompetitorCompareChart() {
        const ctx = document.getElementById('competitorCompareChart');
        if (!ctx) return;

        competitorCompareChartInstance = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: ['Claude', 'ChatGPT', 'Gemini'],
                datasets: []
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: { beginAtZero: true, max: 100 }
                }
            }
        });
        window.competitorCompareChartInstance = competitorCompareChartInstance;
    },

    updateCompetitorCompareChart(datasets) {
        if (!competitorCompareChartInstance) return;
        competitorCompareChartInstance.data.datasets = datasets;
        competitorCompareChartInstance.update();
    }
};
