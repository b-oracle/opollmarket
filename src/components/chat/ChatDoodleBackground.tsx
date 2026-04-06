const doodlePatternSvg = `<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200' viewBox='0 0 200 200'>
  <g fill='none' stroke='currentColor' stroke-width='1.2' stroke-linecap='round' stroke-linejoin='round' opacity='0.35'>
    <g transform='translate(20,20) rotate(-15,12,12)'><rect x='2' y='4' width='20' height='16' rx='3'/><circle cx='12' cy='12' r='4'/><line x1='16' y1='5' x2='16' y2='5.5'/></g>
    <g transform='translate(80,15) rotate(10,10,14)'><rect x='2' y='0' width='16' height='28' rx='3'/><line x1='8' y1='24' x2='12' y2='24'/></g>
    <g transform='translate(150,25) rotate(-8,10,10)'><path d='M4 16 C4 8, 10 2, 16 8 L16 20' /><circle cx='16' cy='22' r='2'/><line x1='4' y1='18' x2='4' y2='22'/></g>
    <g transform='translate(30,80) rotate(12,10,10)'><circle cx='10' cy='6' r='5'/><path d='M2 14 Q10 20 18 14'/></g>
    <g transform='translate(100,70) rotate(-20,10,12)'><path d='M2 20 L10 4 L18 20 Z'/><line x1='10' y1='10' x2='10' y2='16'/></g>
    <g transform='translate(160,80) rotate(5,8,8)'><circle cx='8' cy='8' r='7'/><path d='M3 8 Q8 3 13 8 Q8 13 3 8'/></g>
    <g transform='translate(15,140) rotate(-10,12,10)'><ellipse cx='12' cy='10' rx='10' ry='7'/><path d='M6 17 L2 22'/></g>
    <g transform='translate(75,145) rotate(18,10,10)'><path d='M2 18 Q2 2 10 2 Q18 2 18 18'/><line x1='10' y1='2' x2='10' y2='10'/><line x1='6' y1='7' x2='14' y2='7'/></g>
    <g transform='translate(140,140) rotate(-5,10,10)'><path d='M2 10 Q6 2 10 10 Q14 18 18 10'/><path d='M2 14 Q6 6 10 14 Q14 22 18 14'/></g>
    <g transform='translate(50,50) rotate(8,8,8)'><circle cx='8' cy='8' r='3'/><path d='M12 6 Q18 0 20 6'/><path d='M12 10 Q18 16 20 10'/></g>
    <g transform='translate(120,110) rotate(-12,8,10)'><rect x='1' y='1' width='14' height='18' rx='2'/><line x1='4' y1='6' x2='12' y2='6'/><line x1='4' y1='10' x2='12' y2='10'/><line x1='4' y1='14' x2='9' y2='14'/></g>
    <g transform='translate(55,170) rotate(15,10,10)'><path d='M10 2 L13 8 L20 8 L14 13 L16 20 L10 16 L4 20 L6 13 L0 8 L7 8 Z'/></g>
  </g>
</svg>`;

const doodleBgUrl = `url("data:image/svg+xml,${encodeURIComponent(doodlePatternSvg)}")`;

const ChatDoodleBackground = () => (
  <div
    className="absolute inset-0 pointer-events-none z-[1] opacity-[0.12] dark:opacity-[0.15]"
    style={{
      backgroundImage: doodleBgUrl,
      backgroundSize: "200px 200px",
      backgroundRepeat: "repeat",
    }}
  />
);

export default ChatDoodleBackground;
export { doodleBgUrl, doodlePatternSvg };
