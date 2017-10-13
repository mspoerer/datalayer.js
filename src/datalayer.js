import window from './lib/window';
import utils from './lib/utils';
import cookie from './lib/cookie';

// debugging helper
/* eslint-disable func-names, no-console, prefer-spread, prefer-rest-params */
const DEBUG = typeof process.env.DEBUG !== 'undefined';
function debug() {
  if (DEBUG) {
    console.log.apply(console, ['[debug]:'].concat(Array.prototype.slice.call(arguments)));
  }
}
/* eslint-enable func-names */

debug('debugging enabled');

/**
 * The global Datalayer class, gets instantiated as singleton.
 * The datalayer is responsible for aggregating, providing and loading
 * plugins. The data is then passed to available plugins which can feed
 * it to external and/or third-party plugins.
 */
export class Datalayer {
  constructor() {
    this.initialized = false; // "ready" flag (true, if all plugins are loaded)
    this.metaPrefix = 'dal:'; // prefix for meta[name] attribute
    this.globalData = {}; // data storage
    this.globalConfig = {}; // configuration object (passed via odl:config)
    this.testModeActive = Datalayer.isTestModeActive();
    this.plugins = []; // array with loaded plugins
    this.broadcastQueue = []; // array with all events that have been fired already

    // create promises
    this.readyPromiseResolver = null;
    this.readyPromiseRejector = null;
    this.readyPromise = new Promise((resolve, reject) => {
      this.readyPromiseResolver = resolve;
      this.readyPromiseRejector = reject;
    });
  }

  /**
   * Returns Promise that is resolved as soon as the Datalayer is ready (i.e. initialized,
   * plugins loaded, basics set up).
   * @returns {Promise}
   */
  whenReady() {
    return this.readyPromise;
  }

  /**
   * Validate the given load rule and return either true or false.
   * @param  {Object|boolean}  rule  rule object to validate or a boolean value
   */
  validateRule(rule) {
    if (typeof rule === 'boolean') {
      return rule;
    } else if (typeof rule === 'function') {
      const r = rule(this.globalData);
      return r; // rule(globalData);
    } else if (!rule.test || (rule.test === true && this.testModeActive)) {
      return rule.rule(this.globalData);
    }
    return false;
  }

  /**
   * Returns the global data that was collected and aggregated from the entire page.
   */
  getData() {
    if (this.initialized) {
      return this.globalData;
    }
    throw new Error('.getData called before .initialize (always wrap in whenReady())');
  }

  /**
   * Returns a plugin instance by the id that was assigned via config.
   * @param  {String}  pluginId     the id of the requested plugin
   */
  getPluginById(pluginId) {
    if (this.initialized) {
      for (let i = 0; i < this.plugins.length; i += 1) {
        if (this.plugins[i].constructor.getID() === pluginId) {
          return this.plugins[i];
        }
      }
      return null;
    }
    throw new Error('.getPluginById called before .initialize (always wrap in whenReady())');
  }

  /**
   * Broadcast a public event to all loaded plugins.
   * @param  {String}  name  the event name/type to be fired (e.g. 'load', 'addtocart', ...)
   * @param  {Object}  data  the event data to pass along with the event, may be of any type
   */
  broadcast(name, data) {
    this.plugins.forEach((plugin) => {
      Datalayer.sendEventToPlugin(plugin, name, data);
    });
    debug('queuing broadcast for future purpose', name, data);
    this.broadcastQueue.push([name, data]);
  }

  /**
   * Scan a given HTMLElement for dal:data-Metatags and update global data accordingly.
   * @param {String|HTMLElement}  node  DOM node or CSS selector to scan for data
   */
  scanForDataMarkup(node = window.document) {
    return utils.collectMetadata(`${this.metaPrefix}data`, () => {}, node, this.globalData);
  }

  /**
   * Scan a given HTMLElement for odl:event-Metatags and broadcast any events that
   * were found.
   * @param {String|HTMLElement}  node  DOM node or CSS selector to scan for events
   */
  scanForEventMarkup(node) {
    return utils.collectMetadata(`${this.metaPrefix}event`, (err, element, obj) => {
      if (err) {
        console.error(err);
        return;
      }
      if (!element.hasAttribute('data-odl-handled-event')) {
        element.setAttribute('data-odl-handled-event', 1);
        this.broadcast(obj.name, obj.data);
      }
    }, node);
  }

  /**
   * Add the given plugin - creates a new instance of the plugin and adds it
   * to the internal list of active plugins, overriding plugin config with
   * globally defined configuration (if any).
   * @param {Object} pluginClass  reference to the plugin class
   * @param {Object} config configuration object with private configuration for this individual instance
   */
  addPlugin(pluginClass, config = {}) {
    const pluginId = pluginClass.getID();
    /* eslint-disable new-cap */
    const plugin = new pluginClass(this, this.globalData, this.globalConfig[pluginId] || config);
    /* eslint-enable new-cap */
    this.plugins.push(plugin);
    // broadcast all events that happened until now
    for (let i = 0; i < this.broadcastQueue.length; i += 1) {
      const event = this.broadcastHistory[i];
      debug(`re-broadcasting event '${event[0]}' to plugin '${pluginId}'`);
      Datalayer.sendEventToPlugin(plugin, event[0], event[1]);
    }
  }

  /**
   * Main initialization code. Sets up datalayer, loads plugins, handles execution.
   * @param  {Object}  options  configuration object, see documentation for details
   */
  initialize(options) {
    if (this.initialized) {
      // @XXX: remove
      console.warn('already initialized');
      return false;
    }

    // validate options
    const data = options.data || {};
    const plugins = options.plugins || [];

    // set config (@TODO: also collect config from markup here!)
    this.globalConfig = options.config || {};

    // collect global data from document
    this.globalData = data;
    this.scanForDataMarkup(window.document);

    // validate mandatory data (@TODO: we might use a model-based validation here somewhen)
    if (!data.page || !data.page.type || !data.page.name) {
      throw new Error('Supplied DALPageData is invalid or missing');
    }
    if (!data.site || !data.site.id) {
      throw new Error('Supplied DALSiteData is invalid or missing');
    }
    if (!data.user) {
      throw new Error('Supplied DALUserData is invalid or missing');
    }
    debug('collected data', this.globalData);

    // instantiate plugins based on config and provided ruleset
    if (plugins.length) {
      plugins.forEach((pluginOptions) => {
        if (this.validateRule(pluginOptions.rule)) {
          this.addPlugin(pluginOptions.type, pluginOptions.config);
        }
      });
    }
    debug('plugins:', this.plugins);

    // core initialization is ready, broadcast 'initialize' event and resolve "whenReady" promise
    this.initialized = true;
    debug('broadcasting initialize event', this.broadcast('initialize', this.globalData));
    this.readyPromiseResolver();

    // TEST
    return;

    // override plugins with config.plugins, if defined
    debug('init global plugins', plugins);
    if (config && typeof config.plugins !== 'undefined') {
      debug('overriding global plugins with config.plugins', config.plugins);
      pluginsToLoad = config.plugins;
    }

    // load locally defined plugins
    debug('init local plugins', localPlugins);
    this.loadPlugins(localPlugins || []);
    // collect event data from document and send events to plugins
    debug(`scanning for ${this.metaPrefix}event markup`);
    this.scanForEventMarkup();
    // install method queue
    utils.createMethodQueueHandler(window, '_odlq', this);
    // @TEST (should be done after loading plugins instead)
    this.readyPromiseResolver();
    return true;
  }

  inTestMode() {
    return this.testModeActive === true;
  }

  isReady() {
    return this.initialized === true;
  }

  /**
   * Handle and (un-/)persist test mode for plugin delivery.
   */
  static isTestModeActive() {
    // debug(window.location.search);
    if (cookie.get('__odltest__')) {
      debug('Cookie found');
      if (window.location.search.match(/__odltest__=0/gi)) {
        debug('Removing cokie');
        cookie.remove('__odltest__', { path: '/' });
        return false;
      }
      return true;
    } else if (window.location.search.match(/__odltest__=1/gi)) {
      cookie.set('__odltest__', '1', { path: '/', maxAge: 3600 * 24 * 7 });
      return true;
    }
    return false;
  }

  /**
   * Send event to the given plugin.
   * @param {Object}  plugin the plugin reference (in this.plugins) to broadcast the event to
   * @param {String}  eventName  the event name/type to be fired (e.g. 'load', addtocart', 'click', 'view') OR an object with all three parameters
   * @param {Object}  eventData  the event data to pass along with the event, may be any type of data (not necessarily an object literal)
   */
  static sendEventToPlugin(plugin, eventName, eventData) {
    if (plugin && typeof plugin.handleEvent === 'function') {
      debug(`broadcasting '${eventName}' to plugin '${plugin.id}' with data:`, eventData);
      plugin.handleEvent(eventName, eventData, (new Date()).getTime());
    }
  }
}

// create new ODL singleton instance
const datalayer = new Datalayer();

// XXX: store ODL reference in window (currently needed for functionally testing ODL plugins)
window._datalayer = datalayer;


export default datalayer;