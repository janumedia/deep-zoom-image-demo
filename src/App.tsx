import type { Component } from 'solid-js';

// import logo from './logo.svg';
import styles from './App.module.css';
import ImageZoom from './components/ImageZoom';

const App: Component = () => {
  return (
    <div class={styles.App}>
      <h3>Deep Zoom Image</h3>
      <ImageZoom src="/images/TM-10016388/imageproxy.json"></ImageZoom>
      <div class="logos">
        <div>
          <a href="https://github.com/janumedia" title="Source Code" target="_blank" rel="noopener noreferrer">
            <img src="/assets/github-logo.svg" height="24" alt="Github Logo"/>
          </a>
          <span>Source code</span>
        </div>
        <div>
          <a href="https://www.tropenmuseum.nl" title="Source Photo" target="_blank" rel="noopener noreferrer">
            <img src="/assets/tropenmuseum-logo.svg" height="24" alt="Tropen Museum Logo"/>
          </a>
          <span>Source Photo</span>
        </div>
      </div>
    </div>
  );
};

export default App;
