'use client';
import { useState } from 'react';
import { ArrowUpRight, ArrowRight, Check, Snowflake, Leaf, CalendarDays, MapPin, Sparkles, ClipboardCheck, House } from 'lucide-react';
import { SERVICES } from '@/lib/catalog';
import { Pick } from './shared';
import { ServiceCard } from './site-app';
export function Home(){
 const [service,setService]=useState('snow'),[postal,setPostal]=useState('');
 return <>
  <section className="seasonal-hero">
   <div className="container seasonal-hero-grid">
    <div className="seasonal-hero-copy">
     <div className="eyebrow"><span className="eyebrow-line"/>ST. JOHN’S. ALL YEAR ROUND.</div>
     <h1>Every season.<br/><em>Taken care of.</em></h1>
     <p>Freshly cut lawns. Clear driveways. A home that’s ready for whatever Newfoundland brings.</p>
     <div className="hero-actions"><a className="button" href="/book">Find your property care <ArrowUpRight size={22}/></a><a className="text-link" href="/plans">Explore seasonal plans <ArrowRight size={21}/></a></div>
     <div className="hero-promise"><Check size={20}/><span>One-time help or a plan for the whole year.</span></div>
    </div>
    <div className="seasonal-photography">
     <a className="winter-feature" href="/services/snow" aria-label="Explore winter snow clearing">
      <img src="/winter-hero.webp" width={1536} height={1024} fetchPriority="high" alt="A snow-covered Newfoundland home with a cleared driveway"/>
      <div className="photo-caption"><span className="photo-caption-icon"><Snowflake size={26}/></span><span><span>READY FOR WINTER</span><strong>A clearer start.</strong></span><ArrowUpRight size={24}/></div>
     </a>
     <a className="summer-feature" href="/services/lawn" aria-label="Explore lawn and garden care"><img src="/summer-lawn.webp" width={1536} height={1024} alt="A beautifully maintained lawn beside a coastal home"/><div className="summer-caption"><Leaf size={22}/><strong>A greener summer.</strong><ArrowUpRight size={21}/></div></a>
     <div className="seasonal-index" aria-hidden="true"><span>SNOW</span><span className="index-rule"/><span>MOW</span><span className="index-rule"/><span>MORE</span></div>
    </div>
   </div>
   <div className="container hero-quote-container"><form className="quick-quote brand-quick-quote" onSubmit={e=>{e.preventDefault();window.location.href='/book?service='+service+'&postal='+encodeURIComponent(postal)}}>
    <div className="quick-intro"><span className="quote-form-icon"><House size={26}/></span><div><strong>Let’s start with your home.</strong><span>Your care. Your quote.</span></div></div>
    <div className="field"><label htmlFor="home-service">What can we help with?</label><Pick id="home-service" value={service} onChange={setService} label="Service" options={SERVICES.map(s=>({value:s.id,label:s.name}))}/></div>
    <label htmlFor="home-postal">Your postal code<input id="home-postal" name="postalCode" autoComplete="postal-code" placeholder="e.g. A1A 1A1" value={postal} onChange={e=>setPostal(e.target.value.toUpperCase())} maxLength={7}/></label>
    <button className="button lime">Get my quote <ArrowRight size={22}/></button>
   </form></div>
  </section>
  <div className="container"><div className="trust-strip brand-trust-strip"><div><MapPin size={23}/>Locally focused</div><div><CalendarDays size={23}/>Every season covered</div><div><ClipboardCheck size={23}/>A clear, agreed scope</div><div><House size={23}/>One property account</div></div></div>
  <section className="section home-services"><div className="container"><div className="section-head"><div><div className="eyebrow">A LITTLE LESS ON YOUR LIST</div><h2>Outside looks good.<br/><span className="heading-soft">Life feels easier.</span></h2></div><div><p>Everyday essentials and seasonal resets, brought together around your home.</p><a className="text-link" href="/services">Find your service <ArrowUpRight size={21}/></a></div></div>
   <div className="home-service-grid">{SERVICES.slice(0,2).map(s=><ServiceCard key={s.id} service={s} photo/>)}<div className="feature-card care-feature"><Sparkles size={38} strokeWidth={1.5}/><div className="eyebrow">YOUR CARE PLANNER</div><h3>A good plan<br/>starts with you.</h3><p>Tell us about your driveway, garden and routine. Find the services that fit your property.</p><a className="button white" href="/planner">Build my care plan <ArrowUpRight size={21}/></a><span className="feature-footnote">Adjust your services before requesting a quote.</span></div></div>
  </div></section>
  <section className="year-round-section"><div className="container year-round-layout"><div className="year-round-image"><img src="/summer-lawn.webp" width={1536} height={1024} alt="A green lawn and tidy garden at a Newfoundland home" loading="lazy"/><div className="image-season-label"><Leaf size={26}/><span>A little care goes a long way.</span></div></div><div className="year-round-copy"><div className="eyebrow">ONE HOME. FOUR SEASONS.</div><h2>Good care<br/>stays with you.</h2><p>Bring snow clearing, lawn mowing and seasonal cleanups into one familiar plan. Keep every request, visit and property detail together.</p><div className="season-service-list"><div><Snowflake/><span><strong>Winter, made clearer</strong><span>Driveways, walkways and optional ice treatment.</span></span></div><div><Leaf/><span><strong>Room to enjoy summer</strong><span>Regular mowing, garden care and tidy edges.</span></span></div><div><CalendarDays/><span><strong>A fresh start. A tidy finish.</strong><span>Spring and fall cleanups, tailored to your home.</span></span></div></div><a className="button" href="/book?plan=annual">Build my four-season plan <ArrowUpRight size={21}/></a></div></div></section>
  <section className="section"><div className="container"><div className="section-head"><div><div className="eyebrow">CLEAR FROM THE START</div><h2>Your property.<br/>A simple way forward.</h2></div><p>From the first request to the finished visit, know what happens next.</p></div><div className="workflow brand-workflow">
   <div><span className="workflow-number">01</span><h3>Tell us about your home.</h3><p>Choose your services and share photos, dimensions and access details.</p></div>
   <div><span className="workflow-number">02</span><h3>Make the plan yours.</h3><p>Review your quote, included work and proposed terms before accepting.</p></div>
   <div><span className="workflow-number">03</span><h3>Keep everything in view.</h3><p>Find your visits, completion notes and invoices in your property account.</p></div>
  </div></div></section>
 </>;
}
