import './styles.css'

// 창마다 URL 해시로 화면을 고른다: 작업표시줄 고양이(해시 없음) / 도감(#dex)
if (window.location.hash === '#dex') void import('./dex')
else void import('./overlay')
