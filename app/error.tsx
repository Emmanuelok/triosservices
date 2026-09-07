'use client';
export default function ErrorPage({reset}:{reset:()=>void}){return <main className="container section"><h1>We hit a snag.</h1><p style={{marginTop:20}}>Please try loading the page again. Submitted records remain saved.</p><button className="button" onClick={reset} style={{marginTop:25}}>Try again</button></main>}
