var host="lesis.lat"

if (window.location.host == host && window.location.protocol != "https:") {
    window.location.protocol = "https:"
}

var modal = document.getElementById("contactModal");
var btn   = document.getElementById("contactBtn");
var span  = document.getElementsByClassName("close")[0];

btn.onclick = function () {
    modal.style.display = "block";
}

span.onclick = function () {
    modal.style.display = "none";
}

window.onclick = function (event) {
    if (event.target == modal) {
        modal.style.display = "none";
    }
}

var contactLink = document.getElementById("contactLink");

contactLink.onclick = function (e) {
    e.preventDefault();
    modal.style.display = "block";
}


const hamburger = document.getElementById('hamburgerIcon');
const menu = document.querySelector('nav ul');

hamburger.addEventListener('click', function() {
    // Alterna a classe 'open' para transformar o hambúrguer em X
    hamburger.classList.toggle('open');
    // Alterna a exibição do menu
    menu.classList.toggle('show');
});
