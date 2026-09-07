export function Brand({footer=false}:{footer?:boolean}){
 return <a className={'brand official-brand'+(footer?' brand-on-light':'')} href="/" aria-label="Trios Snow and Mowing Inc. — Home">
  <img className="official-logo" src="/brand/trios-logo.png" width={883} height={300} alt="Trios Snow and Mowing Inc."/>
 </a>;
}
