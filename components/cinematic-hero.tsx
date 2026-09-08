'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowUpRight, ClipboardCheck, House, Leaf, MapPin, Pause, Play, Snowflake, Sparkles, Truck, Wind } from 'lucide-react';

type FilmState = 'poster' | 'loading' | 'playing' | 'paused' | 'unavailable';
type DataConnection = EventTarget & { saveData?: boolean };

const FILM = {
  desktop: '/films/trios-seasons-v1.mp4',
  mobile: '/films/trios-seasons-mobile-v1.mp4',
  poster: '/films/trios-seasons-poster-v1.webp',
};

const serviceFamilies = [
  { name: 'Snow & ice', Icon: Snowflake, links: [['Snow clearing', '/services/snow'], ['Walkways', '/services/walkways'], ['Salting & sanding', '/services/ice'], ['Plow-ridge returns', '/services/windrow']] },
  { name: 'Lawn & garden', Icon: Leaf, links: [['Mowing & edging', '/services/lawn'], ['Garden care', '/services/garden'], ['Aeration', '/services/aeration'], ['Hedge shaping', '/services/hedges']] },
  { name: 'Seasonal cleanup', Icon: Wind, links: [['Spring cleanup', '/services/spring'], ['Fall cleanup', '/services/fall'], ['Yard waste assessment', '/services/hauling'], ['Gutter assessment', '/services/gutters']] },
  { name: 'Cleaning & exteriors', Icon: Sparkles, links: [['Home & rental cleaning', '/services/cleaning'], ['Pressure washing', '/services/washing'], ['Ground-access windows', '/services/windows']] },
  { name: 'Moving, your way', Icon: Truck, links: [['Moving Help', '/moving/help'], ['Local Essentials', '/moving/essentials'], ['Pack & Move', '/moving/pack'], ['Complete Transition', '/moving/complete']] },
  { name: 'Everyday home help', Icon: House, links: [['Bin set-out & return', '/services/bins'], ['Patio setup & pack-away', '/services/furniture']] },
];

/** The poster is server rendered; media URLs are assigned only after preferences are known. */
export function CinematicHero() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const heroRef = useRef<HTMLElement>(null);
  const toggleRef = useRef<(() => void) | null>(null);
  const [ready, setReady] = useState(false);
  const [requested, setRequested] = useState(false);
  const [filmState, setFilmState] = useState<FilmState>('poster');
  const [hasFrame, setHasFrame] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    const hero = heroRef.current;
    if (!video || !hero) return;

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const mobile = window.matchMedia('(max-width: 760px)');
    const connection = (navigator as Navigator & { connection?: DataConnection }).connection;
    let manualIntent: boolean | null = null;
    let disposed = false;
    let currentSource = '';
    let failedSource = '';
    let playAttempt = 0;
    let playPending = false;
    const bounds = hero.getBoundingClientRect();
    let inView = bounds.top < window.innerHeight && bounds.bottom > 0;

    const intendedPlayback = () => manualIntent === true || (manualIntent !== false && !reducedMotion.matches && !connection?.saveData);

    const reconcile = () => {
      if (disposed) return;
      const intended = intendedPlayback();
      setRequested(intended);
      if (!intended || document.hidden || !inView) {
        playAttempt += 1;
        playPending = false;
        video.pause();
        // If a system preference changes, stop downloading a film it no longer permits.
        if (!intended && manualIntent === null && currentSource) {
          video.removeAttribute('src');
          video.load();
          currentSource = '';
          setHasFrame(false);
          setFilmState('poster');
        }
        return;
      }

      const source = mobile.matches ? FILM.mobile : FILM.desktop;
      if (failedSource === source) return;
      if (currentSource !== source) {
        playAttempt += 1;
        playPending = false;
        video.pause();
        video.muted = true;
        video.defaultMuted = true;
        video.src = source;
        video.load();
        currentSource = source;
        setHasFrame(false);
      }
      if (!video.paused || playPending) return;
      const attempt = ++playAttempt;
      playPending = true;
      setFilmState('loading');
      void video.play().then(() => {
        if (disposed || attempt !== playAttempt) return;
        playPending = false;
      }).catch((error: unknown) => {
        if (disposed || attempt !== playAttempt) return;
        playPending = false;
        if (error instanceof DOMException && error.name === 'AbortError') return;
        // Autoplay can be denied by the browser. A direct button press can retry.
        manualIntent = false;
        setRequested(false);
        setFilmState(video.error ? 'unavailable' : 'paused');
      });
    };

    const onPlaying = () => {
      if (!intendedPlayback() || document.hidden || !inView) {
        video.pause();
        return;
      }
      setHasFrame(true);
      setFilmState('playing');
    };
    const onPause = () => { if (!disposed && currentSource && !video.error) setFilmState('paused'); };
    const onWaiting = () => { if (!disposed && intendedPlayback()) setFilmState('loading'); };
    const onError = () => {
      if (disposed) return;
      failedSource = currentSource;
      playAttempt += 1;
      playPending = false;
      manualIntent = false;
      setRequested(false);
      setHasFrame(false);
      setFilmState('unavailable');
    };
    const onPreferenceChange = () => {
      // Newly enabled system preferences always stop automatic playback.
      // An explicit pause survives preference changes and responsive source switches.
      if (manualIntent === true && (reducedMotion.matches || connection?.saveData)) manualIntent = null;
      reconcile();
    };

    toggleRef.current = () => {
      manualIntent = !intendedPlayback();
      if (manualIntent && failedSource) {
        failedSource = '';
        currentSource = '';
      }
      reconcile();
    };
    video.addEventListener('playing', onPlaying);
    video.addEventListener('pause', onPause);
    video.addEventListener('waiting', onWaiting);
    video.addEventListener('error', onError);
    document.addEventListener('visibilitychange', reconcile);
    reducedMotion.addEventListener('change', onPreferenceChange);
    connection?.addEventListener('change', onPreferenceChange);
    mobile.addEventListener('change', reconcile);

    const observer = typeof IntersectionObserver !== 'undefined' ? new IntersectionObserver(([entry]) => {
      inView = entry.isIntersecting;
      reconcile();
    }, { threshold: 0 }) : null;
    observer?.observe(hero);
    setReady(true);
    reconcile();

    return () => {
      disposed = true;
      playAttempt += 1;
      toggleRef.current = null;
      observer?.disconnect();
      document.removeEventListener('visibilitychange', reconcile);
      reducedMotion.removeEventListener('change', onPreferenceChange);
      connection?.removeEventListener('change', onPreferenceChange);
      mobile.removeEventListener('change', reconcile);
      video.removeEventListener('playing', onPlaying);
      video.removeEventListener('pause', onPause);
      video.removeEventListener('waiting', onWaiting);
      video.removeEventListener('error', onError);
      video.pause();
      video.removeAttribute('src');
      video.load();
    };
  }, []);

  return <>
    <section className="cinematic-hero" ref={heroRef} aria-labelledby="cinematic-heading">
      <div className="cinematic-media" aria-hidden="true">
        <img className="cinematic-poster" src={FILM.poster} width={1920} height={1080} fetchPriority="high" alt="" />
        <video id="trios-background-film" className={hasFrame ? 'cinematic-film has-frame' : 'cinematic-film'} ref={videoRef} muted loop playsInline preload="none" poster={FILM.poster} tabIndex={-1} disablePictureInPicture>
          Your browser can display the still image instead of the background film.
        </video>
      </div>
      <div className="cinematic-shade" aria-hidden="true" />
      <div className="container cinematic-composition">
        <div className="cinematic-copy">
          <div className="cinematic-location"><MapPin size={20} aria-hidden="true" /><span>ST. JOHN’S. EVERY SEASON.</span></div>
          <h1 id="cinematic-heading">Life moves.<br /><em>We take care.</em></h1>
          <p>From a clear driveway to the first box in your new home. Property care and moving help, brought together.</p>
          <div className="cinematic-actions"><a className="button lime" href="/book">Build my care plan <ArrowUpRight size={23} aria-hidden="true" /></a><a className="cinematic-secondary" href="/moving">Planning a move? <ArrowUpRight size={21} aria-hidden="true" /></a></div>
          <div className="cinematic-assurance"><ClipboardCheck size={21} aria-hidden="true" /><span>Your property. Your scope. Your agreed price.</span></div>
        </div>
        <div className="cinematic-foot">
          <a className="cinematic-discover" href="#care-for-every-season"><span className="cinematic-scroll-icon"><ArrowDown size={21} aria-hidden="true" /></span><span>Care for every season.<br /><strong>And every new chapter.</strong></span></a>
          <div className="cinematic-film-controls">
            <span className="cinematic-film-caption">A glimpse of life, well cared for.</span>
            <button type="button" className="cinematic-film-toggle" disabled={!ready} aria-controls="trios-background-film" onClick={() => toggleRef.current?.()}>
              {requested ? <Pause size={19} fill="currentColor" aria-hidden="true" /> : <Play size={19} fill="currentColor" aria-hidden="true" />}<span>{requested ? 'Pause film' : filmState === 'unavailable' ? 'Retry film' : 'Play film'}</span>
            </button>
          </div>
        </div>
      </div>
    </section>
    <section id="care-for-every-season" className="cinematic-services" aria-labelledby="cinematic-services-heading">
      <div className="container">
        <div className="cinematic-services-intro"><h2 id="cinematic-services-heading">One home. So many ways to help.</h2><a href="/services">Explore all services <ArrowUpRight size={21} aria-hidden="true" /></a></div>
        <nav className="cinematic-service-grid" aria-label="Explore service families">{serviceFamilies.map(({ name, Icon, links }) => <div className="cinematic-service-family" key={name}><div className="cinematic-service-title"><Icon size={26} strokeWidth={1.5} aria-hidden="true" /><h3>{name}</h3></div><ul>{links.map(([label, href]) => <li key={href}><a href={href}>{label}<ArrowUpRight size={16} aria-hidden="true" /></a></li>)}</ul></div>)}</nav>
      </div>
    </section>
  </>;
}
