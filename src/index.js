// @flow
import React, { Component, PureComponent, createContext, forwardRef } from 'react'

const err = () => console.error('Provider is not initialized yet')

class Prevent extends PureComponent<*> {
  render() {
    const { _children, ...rest } = this.props;
    return _children()(rest)
  }
}

export const initStore: Function = (store, ...middlewares) => {
  let self, initializedMiddlewares
  let subscriptions = []
  const Context = createContext()

  const getState = () => (self ? self.state : err())
  const setState = (action, state, args) => {
    subscriptions.forEach(fn => fn(action, state, args))
    self.setState(state, () => initializedMiddlewares.forEach(m => m(action, args)))
  }

  const subscribe = fn => {
    subscriptions = [...subscriptions, fn]
  }

  const actions = Object.keys(store.actions).reduce(
    (r, v) => ({
      ...r,
      [v]: (...args) => {
        if (self) {
          let result = store.actions[v](self.state, ...args)
          result.then
            ? result.then(result => setState(v, result, args))
            : setState(v, result, args)
        } else {
          err()
        }
      },
    }),
    {},
  )

  class Consumer extends Component {
    props: {
      options: Object,
      children: Function,
      mapStateToProps: Function
    }

    // We do this so the sCU of Prevent will ignore the children prop
    _children = () => this.props.children

    pure = ({ state, actions }) => {
      const { mapStateToProps, ...rest } = this.props
      return (
        <Prevent {...mapStateToProps(state, rest)} actions={actions} _children={this._children} />
      )
    }

    render() {
      const { options, children } = this.props;
      return (
        <Context.Consumer>
          {options && (options.pure !== false) ? this.pure : children}
        </Context.Consumer>
      )
    }
  }

  const connect = (mapStateToProps, options) => WrappedComponent => {
    const ConnectComponent = forwardRef((props, ref) =>
      <Consumer mapStateToProps={mapStateToProps} options={options}>
        {injectedProps => <WrappedComponent {...props} {...injectedProps} ref={ref}/>}
      </Consumer>)
    ConnectComponent.displayName = `Connect(${WrappedComponent.displayName || WrappedComponent.name || 'Unknown'})`
    return ConnectComponent
  }

  class Provider extends Component<*> {
    constructor() {
      super()
      self = this
      this.state = store.initialState
      initializedMiddlewares = middlewares.map(m => m(store, self))
      this.value = { actions, state: this.state }
    }

    render() {
      if (this.state !== this.value.state) {
        // If state was changed then recreate `this.value` so it will have a different reference
        // Explained here: https://reactjs.org/docs/context.html#caveats
        this.value = { actions, state: this.state }
      }
      return (
        <Context.Provider
          value={this.value}
        >
          {this.props.children}
        </Context.Provider>
      )
    }
  }

  return {
    Provider,
    Consumer,
    actions,
    getState,
    connect,
    subscribe,
  }
}
