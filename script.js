// ===== Navigation Hamburger =====
const hamburger = document.querySelector('.hamburger');
const navLink = document.querySelector('.nav-link');

hamburger.addEventListener('click', () => {
  navLink.classList.toggle('active');
});

// ===== Get Started / Hero Buttons =====
const email = "crevasolution@gmail.com"; // Fallback email for mailto
const subject = "Let's Collaborate";
const body = "Hi team, I'm interested in your services.";

function sendEmail() {
  window.location.href = `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

document.getElementById("getStartedBtn").addEventListener("click", sendEmail);
document.getElementById("hero-btn1").addEventListener("click", sendEmail);
document.getElementById("gettouch").addEventListener("click", sendEmail);
document.getElementById("a").addEventListener("click", sendEmail);
document.getElementById("ab").addEventListener("click", sendEmail);

// ===== Project Filter =====
function filterCards(category) {
  const cards = document.querySelectorAll('.project-card');
  const buttons = document.querySelectorAll('.filter-buttons button');

  buttons.forEach(btn => btn.classList.remove('active'));
  event.target.classList.add('active');

  cards.forEach(card => {
    if (category === 'all' || card.dataset.category === category) {
      card.style.display = 'block';
    } else {
      card.style.display = 'none';
    }
  });
}

// ===== Contact Form Submission (FastAPI) =====
const contactForm = document.querySelector("form");

if (contactForm) {
  contactForm.addEventListener("submit", async (e) => {
    e.preventDefault(); // Prevent default reload

    const formData = new FormData(contactForm);

    try {
      const response = await fetch("http://127.0.0.1:8000/send-mail/", {
        method: "POST",
        body: formData
      });

      if (response.ok) {
        alert("Message sent successfully!");
        contactForm.reset();
      } else {
        alert("Error sending message. Please try again.");
      }
    } catch (error) {
      console.error("Error:", error);
      alert("Something went wrong. Check console for details.");
    }
  });
}
// google analytics
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', 'G-QMSB2QLQJX');

