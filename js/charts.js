// js/charts.js - Chart.js 초기화 및 업데이트

let radarChartInstance = null;
let barChartInstance = null;
let qarelRadarChartInstance = null;
let qarelBarChartInstance = null;

const chartService = {
    initCharts() {
        this.initRadarChart();
        this.initBarChart();
        this.initQarelRadarChart();
        this.initQarelBarChart();
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
                labels: ['Claude', 'ChatGPT', 'Gemini', 'Perplexity', 'Grok'],
                datasets: [{
                    label: '언급률 (%)',
                    data: [82, 65, 70, 45, 30],
                    backgroundColor: [
                        '#185FA5',
                        '#3B6D11',
                        '#854F0B',
                        '#607d8b',
                        '#9e9e9e'
                    ],
                    borderWidth: 0,
                    borderRadius: 4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true,
                        max: 100
                    }
                },
                plugins: {
                    legend: { display: false }
                }
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
                    r: {
                        angleLines: { display: true },
                        suggestedMin: 0,
                        suggestedMax: 100
                    }
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
                    backgroundColor: [
                        '#185FA5',
                        '#3B6D11',
                        '#854F0B',
                        '#607d8b',
                        '#9e9e9e'
                    ],
                    borderWidth: 0,
                    borderRadius: 4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true,
                        max: 100
                    }
                },
                plugins: {
                    legend: { display: false }
                }
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
    }
};
