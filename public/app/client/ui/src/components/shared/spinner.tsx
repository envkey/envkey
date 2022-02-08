import React from "react";

export const Spinner = () => {
  return <span dangerouslySetInnerHTML={{ __html: svgString }} />;
};

const svgString = `<svg width="50" height="50" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid" class="uil-spin">
  <path fill="none" class="bk" d="M0 0h100v100H0z"/>
  <g transform="translate(84 50)">
    <circle r="8" fill="#fff"><animate attributeName="opacity" from="1" to=".1" begin="0s" dur="0.8s" repeatCount="indefinite"/>
      <animateTransform attributeName="transform" type="scale" from="1.5" to="1" begin="0s" dur="0.8s" repeatCount="indefinite"/>
    </circle>
  </g>
  <g transform="rotate(45 -52.355 126.397)">
    <circle r="8" fill="#fff">
      <animate attributeName="opacity" from="1" to=".1" begin="0.1s" dur="0.8s" repeatCount="indefinite"/>
      <animateTransform attributeName="transform" type="scale" from="1.5" to="1" begin="0.1s" dur="0.8s" repeatCount="indefinite"/>
    </circle></g><g transform="rotate(90 -17 67)">
    <circle r="8" fill="#fff">
      <animate attributeName="opacity" from="1" to=".1" begin="0.2s" dur="0.8s" repeatCount="indefinite"/>
      <animateTransform attributeName="transform" type="scale" from="1.5" to="1" begin="0.2s" dur="0.8s" repeatCount="indefinite"/>
    </circle>
  </g>
  <g transform="rotate(135 -2.355 42.397)">
    <circle r="8" fill="#fff">
      <animate attributeName="opacity" from="1" to=".1" begin="0.3s" dur="0.8s" repeatCount="indefinite"/>
      <animateTransform attributeName="transform" type="scale" from="1.5" to="1" begin="0.3s" dur="0.8s" repeatCount="indefinite"/>
    </circle>
  </g>
  <g transform="rotate(180 8 25)">
    <circle r="8" fill="#fff">
      <animate attributeName="opacity" from="1" to=".1" begin="0.4s" dur="0.8s" repeatCount="indefinite"/>
      <animateTransform attributeName="transform" type="scale" from="1.5" to="1" begin="0.4s" dur="0.8s" repeatCount="indefinite"/>
    </circle>
  </g>
  <g transform="rotate(-135 18.355 7.603)">
    <circle r="8" fill="#fff">
      <animate attributeName="opacity" from="1" to=".1" begin="0.5s" dur="0.8s" repeatCount="indefinite"/>
      <animateTransform attributeName="transform" type="scale" from="1.5" to="1" begin="0.5s" dur="0.8s" repeatCount="indefinite"/>
    </circle>
  </g>
  <g transform="rotate(-90 33 -17)">
    <circle r="8" fill="#fff">
      <animate attributeName="opacity" from="1" to=".1" begin="0.6s" dur="0.8s" repeatCount="indefinite"/>
      <animateTransform attributeName="transform" type="scale" from="1.5" to="1" begin="0.6s" dur="0.8s" repeatCount="indefinite"/>
    </circle>
  </g>
  <g transform="rotate(-45 68.355 -76.397)">
    <circle r="8" fill="#fff">
      <animate attributeName="opacity" from="1" to=".1" begin="0.7s" dur="0.8s" repeatCount="indefinite"/>
      <animateTransform attributeName="transform" type="scale" from="1.5" to="1" begin="0.7s" dur="0.8s" repeatCount="indefinite"/>
    </circle>
  </g>
</svg>`;
