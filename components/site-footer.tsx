import { ArrowUpRight,Phone,Mail } from 'lucide-react';
import { Brand } from './brand';
import { CONTACT } from '@/lib/catalog';
export function Footer(){return <footer className="footer brand-footer">
 <div className="container footer-invitation"><div><div className="eyebrow">YOUR HOME. IN GOOD HANDS.</div><h2>One less thing<br/>on your list.</h2></div><div><p>Find the right care for your property,<br/>from the first snowfall to the last lawn cut.</p><a className="button lime" href="/book">Let’s take care of it <ArrowUpRight size={23}/></a></div></div>
 <div className="container"><div className="footer-grid"><div className="footer-brand"><Brand footer/><p>Snow clearing, lawn care and a little help through every season.</p><span className="footer-location">St. John’s, Newfoundland & Labrador</span></div>
 <div><h4>PROPERTY CARE</h4><div className="footer-links"><a href="/services/snow">Snow clearing</a><a href="/services/lawn">Lawn & garden</a><a href="/services/fall">Seasonal cleanups</a><a href="/plans">Four-season plans</a><a href="/services">All services</a></div></div>
 <div><h4>YOUR TRIOS</h4><div className="footer-links"><a href="/portal">My property</a><a href="/planner">Care planner</a><a href="/areas">Service areas</a><a href="/contact">Contact us</a></div></div>
 <div className="footer-contact"><h4>A FAMILIAR TEAM TO CALL</h4><div className="footer-links"><a className="footer-phone" href={'tel:'+CONTACT.tel}><Phone size={20}/>{CONTACT.phone}</a><a href={'mailto:'+CONTACT.email}><Mail size={20}/>{CONTACT.email}</a><span>{CONTACT.website}</span></div></div></div>
 <div className="footer-bottom"><span>© 2026 Trios Snow and Mowing Inc.</span><div><a href="/privacy">Privacy</a><a href="/terms">Service information</a><span>Prices in CAD</span></div></div></div>
 </footer>}
