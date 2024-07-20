### Nunjucks (v4, currently in alpha)

[Nunjucks](https://mozilla.github.io/nunjucks/) is a full featured
templating engine for javascript. It is heavily inspired by
[jinja2](http://jinja.pocoo.org/). View the docs
[here](https://mozilla.github.io/nunjucks/).

The main repository for nunjucks can be found at
[https://github.com/mozilla/nunjucks](https://github.com/mozilla/nunjucks).
This is an experimental rewrite that is not yet production ready.

The code in this repository adheres very closely to the functionality of
[Jinja](https://jinja.palletsprojects.com/en/3.1.x/); much more so than
earlier versions of nunjucks. As a port of jinja2, it is nearly
feature-complete, with the exception of a few filters (search for `skip` in
[`filters.test.ts`](https://github.com/nunjucks/nunjucks4/blob/main/test/filters.test.ts)).
In other words, the core templating engine is more-or-less done.

What this library lacks are those things that make nunjucks usable: a build
process to transpile and bundle for node and the browser, CI to run tests,
generate builds, and create releases, and scripts for precompiling templates.
Also missing are the methods that would make this library more backwards
compatible with the nunjucks v3 API.
 