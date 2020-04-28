import "babel-polyfill";
import "./live-common-setup";
import React, { Component } from "react";
import ReactDOM from "react-dom";
import { BrowserRouter, Route, Link, Switch } from "react-router-dom";
import { version } from "@ledgerhq/live-common/package.json";
import "./index.css";
// import registerServiceWorker from "./registerServiceWorker";
import Demos from "./demos";

window.LEDGER_CV_API =
  window.LEDGER_CV_API || "https://countervalues.api.live.ledger.com";

class Dashboard extends Component {
  render() {
    return (
      <div style={{ width: 600, margin: "40px auto", fontSize: "32px" }}>
        {Object.keys(Demos).map(key => {
          const Demo = Demos[key];
          const { url, title } = Demo.demo;
          return (
            <Link key={key} to={url} style={{ display: "block", padding: 20 }}>
              {title}
            </Link>
          );
        })}
        <footer style={{ fontSize: "16px" }}>
          @ledgerhq/live-common {version}
        </footer>
      </div>
    );
  }
}

class App extends Component {
  render() {
    return (
      <Switch>
        <Route exact path="/" component={Dashboard} />
        {Object.keys(Demos).map(key => {
          const Demo = Demos[key];
          const { url } = Demo.demo;
          return <Route key={key} path={url} component={Demo} />;
        })}
      </Switch>
    );
  }
}

ReactDOM.render(
  <BrowserRouter>
    <App />
  </BrowserRouter>,
  document.getElementById("root")
);

// registerServiceWorker();
