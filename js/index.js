const recBtn = document.getElementById('recBtn');

if(recBtn){
    recBtn.addEventListener("click", function() {
        window.location.href = window.location.href.replace("index.html", "listening.html");
    });
}