// تبديل الثيم
const themeToggle = document.getElementById('themeToggle');
themeToggle.addEventListener('click', () => {
  document.documentElement.classList.toggle('dark');
  themeToggle.textContent = document.documentElement.classList.contains('dark') ? '☀️' : '🌙';
});

const drawer = document.getElementById('drawer');

// أزرار الشريط تفتح الـ drawer
document.querySelectorAll('.rail-btn[data-panel]').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.rail-btn[data-panel]').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    drawer.classList.add('open');
  });
});

// زر الإغلاق
document.getElementById('closeDrawer').addEventListener('click', () => {
  drawer.classList.toggle('open');
});

// صفوف الدروس
document.querySelectorAll('.row:not(.locked)').forEach(row => {
  row.addEventListener('click', () => {
    document.querySelectorAll('.row').forEach(r => r.classList.remove('active'));
    row.classList.add('active');
  });
});
