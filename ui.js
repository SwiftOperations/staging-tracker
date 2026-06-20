window.adjustCount = function(id, amt) { if($('#'+id)) $('#'+id).value = Math.max(0, (parseInt($('#'+id).value)||0) + amt); };
window.adjustEditCount = function(id, amt) { if($('#'+id)) $('#'+id).value = Math.max(0, (parseInt($('#'+id).value)||0) + amt); };

window.formatWeight = function(input) {
  let value = input.value.replace(/[^0-9.]/g, ''); let parts = value.split('.');
  if (parts[0]) parts[0] = parseInt(parts[0], 10).toLocaleString('en-US');
  input.value = parts.slice(0, 2).join('.');
};

window.formatContainer = function(count, type) {
  if(!count || count === 0) return '';
  if(count === 1) return `1 ${type}`;
  if(type === 'Box') return `${count} Boxes`;
  if(type === 'Pipe/Rod' || type === 'Other') return `${count} ${type}`;
  return `${count} ${type}s`;
};

window.parseContainerString = function(typeStr) {
  let sk = 0, bx = 0, cr = 0, pi = 0, ot = 0; if(!typeStr) return { sk, bx, cr, pi, ot };
  const matchSk = typeStr.match(/(\d+)\s*Skid/); if(matchSk) sk = parseInt(matchSk[1]);
  const matchBx = typeStr.match(/(\d+)\s*Box/);  if(matchBx) bx = parseInt(matchBx[1]);
  const matchCr = typeStr.match(/(\d+)\s*Crate/);if(matchCr) cr = parseInt(matchCr[1]);
  const matchPi = typeStr.match(/(\d+)\s*Pipe\/Rod/);if(matchPi) pi = parseInt(matchPi[1]);
  const matchOt = typeStr.match(/(\d+)\s*Other/);if(matchOt) ot = parseInt(matchOt[1]);
  return { sk, bx, cr, pi, ot };
};

window.getDynamicType = function(prefix) {
  const sk = parseInt($(`#${prefix}_skid`) ? $(`#${prefix}_skid`).value : 0)||0;
  const bx = parseInt($(`#${prefix}_box`) ? $(`#${prefix}_box`).value : 0)||0;
  const cr = parseInt($(`#${prefix}_crate`) ? $(`#${prefix}_crate`).value : 0)||0;
  const pi = parseInt($(`#${prefix}_pipe`) ? $(`#${prefix}_pipe`).value : 0)||0;
  const ot = parseInt($(`#${prefix}_other`) ? $(`#${prefix}_other`).value : 0)||0;
  let typeParts = []; 
  if(sk) typeParts.push(window.formatContainer(sk, 'Skid')); if(bx) typeParts.push(window.
