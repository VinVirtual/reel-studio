/* Optional. Custom scene types for this project only.
   Use in script.json as {"id": "x", "type": "custom", "fn": "calendar", "say": "..."}.
   Header (tag + title) is drawn for you; draw the body between L.bodyTop and L.bodyBottom.
   api: ctx, W, H, L, C, prog, outCubic, outBack, wt(s, "word"), panel, text, pill, icon, stamp, button, arrow, fitBody, ...
   (the full list is in references/scenes.md). Draw only from t: frames are rendered out of order. */
window.CUSTOM = {
  calendar(t, s, api) {
    const { ctx, L, C, W, panel, text, prog, outBack, rgba } = api
    const x = L.x0, w = L.x1 - L.x0, y0 = L.bodyTop + 20, cw = w / 7, ch = 70
    panel(x, y0, w, ch * 6 + 100)
    ;['M', 'T', 'W', 'T', 'F', 'S', 'S'].forEach((d, i) => text(d, x + cw * i + cw / 2, y0 + 60, { size: 26, color: 'mute', align: 'center' }))
    for (let d = 1; d <= 31; d++) {
      const i = d + 1, cx = x + cw * (i % 7) + cw / 2, cy = y0 + 110 + Math.floor(i / 7) * ch
      const booked = (s.booked || []).includes(d), k = outBack(prog(t, s.start + 0.3 + d * 0.02, 0.3), 2)
      ctx.save(); ctx.globalAlpha *= Math.min(1, k)
      if (booked) { ctx.beginPath(); ctx.arc(cx, cy - 8, 28, 0, Math.PI * 2); ctx.fillStyle = rgba(C.bad, 0.25); ctx.fill() }
      text(String(d), cx, cy, { size: 28, align: 'center', color: booked ? C.badHi : C.text })
      ctx.restore()
    }
  },
}
