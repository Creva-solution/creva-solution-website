document.addEventListener('DOMContentLoaded', function () {
    // Initialize AOS
    AOS.init({
        duration: 1000,
        once: true,
        easing: 'ease-out-cubic'
    });

    // Initialize Lucide Icons
    lucide.createIcons();

    // Mobile Menu Toggle
    const mobileMenuBtn = document.getElementById('mobile-menu-btn');
    const mobileMenu = document.getElementById('mobile-menu');

    if (mobileMenuBtn && mobileMenu) {
        mobileMenuBtn.addEventListener('click', () => {
            mobileMenu.classList.toggle('hidden');
        });
    }

    // Set Current Year
    const currentYearSpan = document.getElementById('current-year');
    if (currentYearSpan) {
        currentYearSpan.textContent = new Date().getFullYear();
    }

    // Scroll to Top on Refresh
    if ('scrollRestoration' in history) {
        history.scrollRestoration = 'manual';
    }
    window.scrollTo(0, 0);

    // --- Team Modal Logic (About Page) ---
    const teamModal = document.getElementById('team-modal');
    if (teamModal) {
        const teamModalContent = document.getElementById('team-modal-content');
        const teamModalBackdrop = document.getElementById('team-modal-backdrop');
        const teamModalClose = document.getElementById('team-modal-close');

        // Elements to populate
        const modalImage = document.getElementById('modal-image');
        const modalName = document.getElementById('modal-name');
        const modalRole = document.getElementById('modal-role');
        const modalBio = document.getElementById('modal-bio');
        const modalLinkedin = document.getElementById('modal-linkedin');
        const modalInstagram = document.getElementById('modal-instagram');
        const modalFacebook = document.getElementById('modal-facebook');

        // Function to open modal (exposed to global scope for onclick)
        window.openTeamModal = function (member) {
            modalImage.src = member.image;
            modalName.textContent = member.name;
            modalRole.textContent = member.role;
            modalBio.textContent = member.bio;

            // Handle Social Links
            if (member.linkedin) {
                modalLinkedin.href = member.linkedin;
                modalLinkedin.classList.remove('hidden');
            } else {
                modalLinkedin.classList.add('hidden');
            }

            if (member.instagram) {
                modalInstagram.href = member.instagram;
                modalInstagram.classList.remove('hidden');
            } else {
                modalInstagram.classList.add('hidden');
            }

            if (member.facebook) {
                modalFacebook.href = member.facebook;
                modalFacebook.classList.remove('hidden');
            } else {
                modalFacebook.classList.add('hidden');
            }

            // Show modal
            teamModal.classList.remove('hidden');
            // Small delay to allow display:block to apply before opacity transition
            setTimeout(() => {
                teamModal.classList.remove('opacity-0');
                teamModalContent.classList.remove('translate-y-10', 'scale-95');
            }, 10);
            document.body.style.overflow = 'hidden';
        };

        // Function to close modal
        function closeTeamModal() {
            teamModal.classList.add('opacity-0');
            teamModalContent.classList.add('translate-y-10', 'scale-95');

            setTimeout(() => {
                teamModal.classList.add('hidden');
                document.body.style.overflow = '';
            }, 300); // Match transition duration
        }

        teamModalClose.addEventListener('click', closeTeamModal);
        teamModalBackdrop.addEventListener('click', closeTeamModal);

        // Close on Escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && !teamModal.classList.contains('hidden')) {
                closeTeamModal();
            }
        });
    }

    // --- Client Modal Logic (Clients Page) ---
    const clientModal = document.getElementById('client-modal');
    if (clientModal) {
        const clientModalContent = document.getElementById('client-modal-content');
        const clientModalBackdrop = document.getElementById('client-modal-backdrop');
        const clientModalClose = document.getElementById('client-modal-close');

        // Elements to populate
        const modalIcon = document.getElementById('client-modal-icon');
        const modalName = document.getElementById('client-modal-name');
        const modalCategory = document.getElementById('client-modal-category');
        const modalReview = document.getElementById('client-modal-review');
        const modalWebsite = document.getElementById('client-modal-website');

        window.openClientModal = function (client) {
            modalName.textContent = client.name;
            modalReview.textContent = client.review;
            if (client.website && client.website !== '#' && client.website.trim() !== '') {
                modalWebsite.href = client.website;
                // Show button and set URL
                modalWebsite.classList.remove('hidden');
                modalWebsite.classList.add('inline-flex'); // Ensure flex display when shown
            } else {
                modalWebsite.classList.add('hidden');
                modalWebsite.classList.remove('inline-flex');
            }

            // Category Styling (Icons & Labels only)
            if (client.category === 'IT') {
                modalIcon.className = 'w-20 h-20 mx-auto rounded-2xl flex items-center justify-center text-3xl font-bold mb-4 bg-blue-50 text-blue-600';
                modalCategory.className = 'inline-block px-3 py-1 rounded-full text-xs font-bold tracking-wide uppercase bg-blue-100 text-blue-600';
                modalCategory.textContent = 'IT Partner';
            } else {
                modalIcon.className = 'w-20 h-20 mx-auto rounded-2xl flex items-center justify-center text-3xl font-bold mb-4 bg-orange-50 text-orange-600';
                modalCategory.className = 'inline-block px-3 py-1 rounded-full text-xs font-bold tracking-wide uppercase bg-orange-100 text-orange-600';
                modalCategory.textContent = 'Civil Partner';
            }


            if (client.logo) {
                // If logo exists, show image instead of initials
                modalIcon.innerHTML = `<img src="${client.logo}" alt="${client.name}" class="w-full h-full object-contain p-2 rounded-2xl">`;
                // Keep the bg color container but ensure image fits
                modalIcon.className = `w-20 h-20 mx-auto rounded-2xl flex items-center justify-center mb-4 bg-white border border-gray-100 shadow-sm`;
            } else {
                // Fallback to initials
                modalIcon.textContent = client.name.charAt(0);

                if (client.category === 'IT') {
                    modalIcon.className = 'w-20 h-20 mx-auto rounded-2xl flex items-center justify-center text-3xl font-bold mb-4 bg-blue-50 text-blue-600';
                } else {
                    modalIcon.className = 'w-20 h-20 mx-auto rounded-2xl flex items-center justify-center text-3xl font-bold mb-4 bg-orange-50 text-orange-600';
                }
            }

            // Show modal
            clientModal.classList.remove('hidden');
            setTimeout(() => {
                clientModal.classList.remove('opacity-0');
                clientModalContent.classList.remove('scale-95');
            }, 10);
            document.body.style.overflow = 'hidden';
        };

        function closeClientModal() {
            clientModal.classList.add('opacity-0');
            clientModalContent.classList.add('scale-95');

            setTimeout(() => {
                clientModal.classList.add('hidden');
                document.body.style.overflow = '';
            }, 300);
        }

        clientModalClose.addEventListener('click', closeClientModal);
        clientModalBackdrop.addEventListener('click', closeClientModal);

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && !clientModal.classList.contains('hidden')) {
                closeClientModal();
            }
        });
    }

});
