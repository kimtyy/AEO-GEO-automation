const url = 'https://ohmptflnwplotzfwnsuq.supabase.co/rest/v1/?apikey=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9obXB0Zmxud3Bsb3R6Znduc3VxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE1NDk5MzEsImV4cCI6MjA5NzEyNTkzMX0.GtlDRgKW6surk-O_2jU1oChDOUnLGN_oIRblvfcF4k8';

fetch(url)
.then(res => res.json())
.then(data => {
    console.log(Object.keys(data.definitions || {}));
    if (data.definitions && data.definitions.analysis_results) {
        console.log("analysis_results columns:", Object.keys(data.definitions.analysis_results.properties));
    }
})
.catch(err => console.error('Error:', err));
