// app/static/js/main.js

document.addEventListener('DOMContentLoaded', function() {
    // Переключение боковой панели
    const sidebarCollapse = document.getElementById('sidebarCollapse');
    const sidebar = document.getElementById('sidebar');
    const content = document.getElementById('content');

    if (sidebarCollapse) {
        sidebarCollapse.addEventListener('click', function() {
            sidebar.classList.toggle('active');
            content.classList.toggle('active');
        });
    }

    // Раскрытие/скрытие подменю
    const dropdownToggles = document.querySelectorAll('.dropdown-toggle');

    dropdownToggles.forEach(function(toggle) {
        toggle.addEventListener('click', function(e) {
            e.preventDefault();

            // Идентификатор целевого элемента (подменю)
            const targetId = this.getAttribute('href');
            const targetElement = document.querySelector(targetId);

            // Переключение класса show для целевого элемента
            if (targetElement) {
                targetElement.classList.toggle('show');
            }

            // Изменение aria-expanded атрибута
            const isExpanded = this.getAttribute('aria-expanded') === 'true';
            this.setAttribute('aria-expanded', !isExpanded);
        });
    });

    // Автоматическое закрытие предупреждений
    const alerts = document.querySelectorAll('.alert');

    alerts.forEach(function(alert) {
        setTimeout(function() {
            const closeButton = alert.querySelector('.close');
            if (closeButton) {
                closeButton.click();
            }
        }, 5000);
    });

    // Подсветка активных пунктов меню
    const currentUrl = window.location.pathname;
    const menuItems = document.querySelectorAll('#sidebar ul li a');

    menuItems.forEach(function(item) {
        const itemUrl = item.getAttribute('href');

        if (itemUrl === currentUrl) {
            item.parentElement.classList.add('active');

            // Если элемент находится в подменю, раскрываем родительское меню
            const parentSubmenu = item.closest('ul.collapse');
            if (parentSubmenu) {
                parentSubmenu.classList.add('show');

                const parentToggle = document.querySelector(`[href="#${parentSubmenu.id}"]`);
                if (parentToggle) {
                    parentToggle.setAttribute('aria-expanded', 'true');
                }
            }
        }
    });

    // Инициализация всплывающих подсказок
    const tooltipTriggerList = document.querySelectorAll('[data-toggle="tooltip"]');

    if (typeof bootstrap !== 'undefined') {
        tooltipTriggerList.forEach(function(tooltipTriggerEl) {
            new bootstrap.Tooltip(tooltipTriggerEl);
        });
    }
});