import { ImageResponse } from 'next/og.js'
import React from 'react'
import { readFileSync, writeFileSync } from 'fs'

const logoSrc = `data:image/png;base64,${readFileSync('public/logo-square.png').toString('base64')}`

const el = React.createElement('div', { style: { width:'100%', height:'100%', display:'flex', flexDirection:'column', alignItems:'flex-start', justifyContent:'center', background:'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)', padding:80, position:'relative' } },
  React.createElement('div', { style: { position:'absolute', top:0, right:0, width:500, height:500, background:'radial-gradient(circle at top right, rgba(22,163,74,0.25), transparent 60%)' } }),
  React.createElement('div', { style: { display:'flex', alignItems:'center', gap:24, marginBottom:40 } },
    React.createElement('img', { src: logoSrc, width:64, height:64, style: { borderRadius:16, objectFit:'cover' } }),
    React.createElement('div', { style: { fontSize:42, fontWeight:800, color:'#ffffff', letterSpacing:'-0.02em' } }, 'Star Hawk Builders Merchant')
  ),
  React.createElement('div', { style: { fontSize:64, fontWeight:800, color:'#ffffff', lineHeight:1.1, maxWidth:900, letterSpacing:'-0.03em' } }, 'Star Hawk Builders Merchant | Building Materials & Timber'),
  React.createElement('div', { style: { fontSize:28, color:'#cbd5e1', marginTop:32, maxWidth:900, lineHeight:1.4 } }, 'Building materials, aggregates, bricks, timber, blocks & more from Star Hawk Builders Merchant. Same-day delivery across Greater London & the Home Counties.'),
  React.createElement('div', { style: { position:'absolute', bottom:60, left:80, display:'flex', alignItems:'center', gap:16, fontSize:22, color:'#94a3b8', fontWeight:600 } },
    React.createElement('span', { style: { color:'#16a34a' } }, '●'),
    'Same-day delivery · Trade accounts · Local stock'
  )
)

const res = new ImageResponse(el, { width:1200, height:630 })
const buf = Buffer.from(await res.arrayBuffer())
writeFileSync('public/og-fallback.png', buf)
console.log('wrote public/og-fallback.png', buf.length, 'bytes')
