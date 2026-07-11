interface Props { open: boolean; onClose: () => void }

export default function HelpModal({ open, onClose }: Props) {
  if (!open) return null;

  return (
    <div className="help-overlay" onClick={onClose} role="presentation">
      <section className="help-dialog" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="help-title">
        <header className="help-header">
          <div><p className="eyebrow">Tiny guide</p><h2 id="help-title">How to play</h2></div>
          <button onClick={onClose} aria-label="Close help">×</button>
        </header>

        <div className="help-demo" aria-label="A King moves to a corner, followed by a Queen and Jack in alternating colours">
          <div className="demo-table" aria-hidden="true">
            <span className="demo-corner">K</span>
            <span className="demo-mini-card demo-king">K<i>♠</i></span>
            <span className="demo-mini-card demo-queen">Q<i>♥</i></span>
            <span className="demo-mini-card demo-jack">J<i>♣</i></span>
          </div>
          <p>King opens a corner. Then build down in alternating colours.</p>
        </div>

        <div className="help-rules">
          <div><span>01</span><section><h3>Clear your hand</h3><p>First player with no cards wins the table.</p></section></div>
          <div><span>02</span><section><h3>Build down, swap colours</h3><p>Put a black Jack on a red Queen, a red Ten on a black Jack, and so on.</p></section></div>
          <div><span>03</span><section><h3>Move complete piles</h3><p>Glowing piles can move as one sequence. Kings always stay in corners.</p></section></div>
          <div><span>04</span><section><h3>Keep playing</h3><p>Make every useful move, then finish your turn. Inactivity triggers one move every 10 seconds.</p></section></div>
        </div>
        <button className="help-done" onClick={onClose}>Okay, let’s play</button>
      </section>
    </div>
  );
}
