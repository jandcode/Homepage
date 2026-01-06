document.addEventListener('DOMContentLoaded', () => {

    const navBar = document.querySelector('.nav-bar');

    // Scroll Effect for Navbar
    window.addEventListener('scroll', () => {
        if (window.scrollY > 20) {
            navBar.style.background = "rgba(255, 255, 255, 0.8)";
            navBar.style.backdropFilter = "blur(12px)";
            navBar.style.borderBottom = "1px solid rgba(0,0,0,0.05)";
            navBar.style.padding = "16px 0"; // shrink slightly
        } else {
            navBar.style.background = "rgba(255, 255, 255, 0.5)"; // original transparent
            navBar.style.backdropFilter = "blur(10px)";
            navBar.style.borderBottom = "1px solid rgba(0,0,0,0.03)";
            navBar.style.padding = "24px 0"; // original size
        }
    });

    // Simple fade-in animation for sections (Intersection Observer)
    const observerOptions = {
        threshold: 0.1
    };

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('visible');
                observer.unobserve(entry.target);
            }
        });
    }, observerOptions);

    document.querySelectorAll('section').forEach(section => {
        section.classList.add('fade-in-section');
        section.style.opacity = "0";
        section.style.transform = "translateY(20px)";
        section.style.transition = "opacity 0.6s ease-out, transform 0.6s ease-out";
        section.style.willChange = "opacity, transform";
        observer.observe(section);
    });

    // JS side of the fade-in class logic if CSS is missing it
    document.head.insertAdjacentHTML("beforeend", `<style>
        section.visible { opacity: 1 !important; transform: none !important; }
    </style>`)
});
