document.addEventListener('DOMContentLoaded', () => {
    const notifyForm = document.getElementById('notify-form');
    const emailInput = document.getElementById('email-input');
    const successMsg = document.getElementById('success-msg');
    const btnNotify = document.getElementById('btn-notify');

    if (notifyForm) {
        notifyForm.addEventListener('submit', (e) => {
            e.preventDefault();

            const email = emailInput.value.trim();
            if (email) {
                // Simulate API call
                btnNotify.disabled = true;
                btnNotify.textContent = 'Sending...';

                setTimeout(() => {
                    notifyForm.style.display = 'none';
                    successMsg.classList.add('show');
                    console.log(`Newsletter signup for: ${email}`);
                }, 1000);
            }
        });
    }

    // Interactive hover effect for the logo
    const logo = document.querySelector('.logo-icon');
    if (logo) {
        logo.addEventListener('mouseover', () => {
            logo.style.transform = 'scale(1.1) rotate(5deg)';
            logo.style.transition = 'transform 0.3s ease';
        });
        logo.addEventListener('mouseout', () => {
            logo.style.transform = 'scale(1) rotate(0deg)';
        });
    }
});
