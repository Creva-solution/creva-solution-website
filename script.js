  const hamburger = document.querySelector('.hamburger');
  const navLink = document.querySelector('.nav-link');

  hamburger.addEventListener('click', () => {
    navLink.classList.toggle('active');
  });
  // get touch btn code
    const email = "crevasolution@gmail.com"; // Replace with your actual email
  const subject = "Let's Collaborate";
  const body = "Hi team, I'm interested in your services.";

  // Function to open email client
  function sendEmail() {
    window.location.href = `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  }

  // Attach event listeners
  document.getElementById("getStartedBtn").addEventListener("click", sendEmail);
  document.getElementById("getInTouchBtn").addEventListener("click", sendEmail);
  document.getElementById("StartYourBtn").addEventListener("click", sendEmail);
  document.getElementById("a").addEventListener("click", sendEmail);
