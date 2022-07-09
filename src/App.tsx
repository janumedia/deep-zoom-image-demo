import { Component, createSignal } from 'solid-js';

// import logo from './logo.svg';
import styles from './App.module.css';
import ImageZoom from './components/ImageZoom';

const App: Component = () => {
  const [format, setFormat] = createSignal("dzi");
  return (
    <div class={styles.App}>
      <h1>Deep Zoom Image</h1>
      <nav>
        <div data-selected={format() == 'dzi'} onClick={()=>setFormat("dzi")}>DZI</div>
        <div data-selected={format() == 'zoomify'} onClick={()=>setFormat("zoomify")}>Zoomify</div>
      </nav>
      {format() == "dzi" && <ImageZoom src="/images/TM-10016388/imageproxy.json"></ImageZoom>}
      {format() == "zoomify" && <ImageZoom src="/images/Kuntisraya/imageproxy.json"></ImageZoom>}
      <div class="logos">
        <div>
          <a href="https://github.com/janumedia" title="Source Code" target="_blank" rel="noopener noreferrer">
            <img src="/assets/github-logo.svg" height="24" alt="Github Logo"/>
          </a>
          <span>Source code</span>
        </div>
        <div>
          <a href="https://www.tropenmuseum.nl" title="Source Photo #1" target="_blank" rel="noopener noreferrer">
            <img src="/assets/tropenmuseum-logo.svg" height="24" alt="Tropen Museum Logo"/>
          </a>
          <span>Source Photo #1</span>
        </div>
        <div>
          <a href="https://commons.wikimedia.org" title="Source Photo #2" target="_blank" rel="noopener noreferrer">
            <img src="/assets/commons-logo.svg" height="24" alt="Wikimedia Commons Logo"/>
          </a>
          <span>Source Photo #2</span>
        </div>
      </div>
    </div>
  );
};

export default App;
