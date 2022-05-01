import { GraphQLFieldConfig, GraphQLResolveInfo, ThunkObjMap } from 'graphql';
import { ROUTER_SYMBOL } from './decorators';

export type Next = (error?: Error) => any;

export type Middleware = (next: Next, parent: any, args: any, context?: any, info?: GraphQLResolveInfo) => any;

export class Route {
  constructor(
    public path: string,
    public resolver: GraphQLFieldConfig<any, any, any>,
    public middleware: Middleware[]
  ) {}
}

export class Router {
  private middlewares: Middleware[] = [];
  private queryRoutes: Route[] = [];
  private mutationRoutes: Route[] = [];

  static getRouter(constructor: Function): Router {
    const router = Reflect.getMetadata(ROUTER_SYMBOL, constructor);
    return router;
  }
  use(router: Router): Router;
  use(...middlewares: Middleware[]): Router;

  use(...val: unknown[]) {
    if (!val || val.length === 0) throw new Error('argument is required for router.use');
    if (val[0] instanceof Router) {
      const queryFields = val[0].getQueryFields();
      const mutationFields = val[0].getMutationFields();

      for (const key in queryFields) {
        this.query(key, (queryFields as any)[key]);
      }

      for (const key in mutationFields) {
        this.mutation(key, (mutationFields as any)[key]);
      }
    } else if (typeof val[0] === 'function') {
      this.middlewares = this.middlewares.concat(val as Middleware[]);
    }
    return this;
  }

  query(path: string, resolver: GraphQLFieldConfig<any, any, any>, ...middleware: Middleware[]) {
    this.queryRoutes.push(new Route(path, resolver, [...this.middlewares, ...middleware]));
    return this;
  }

  mutation(path: string, resolver: GraphQLFieldConfig<any, any, any>, ...middleware: Middleware[]) {
    this.mutationRoutes.push(new Route(path, resolver, [...this.middlewares, ...middleware]));
    return this;
  }

  compress(route: Route): GraphQLFieldConfig<any, any, any> {
    const allMiddlewares = route.middleware;
    const n = allMiddlewares.length;
    let pos = 0;
    const graphQLField = route.resolver;

    let newResolver = (parent: any, args: any, context: any, info: GraphQLResolveInfo) => {
      let main: any = null;
      const next: Next = (error?: Error) => {
        if (error) {
          throw error;
        } else if (pos < n) {
          return allMiddlewares[pos++](next, parent, args, context, info);
        } else if (graphQLField.resolve) {
          main = graphQLField.resolve(parent, args, context, info);
          pos = 0;
          // console.log('main = ', main);
          // console.log('returning main');
          return main;
        }
      };

      return next();
    };

    return {
      ...graphQLField,
      resolve: newResolver,
    };
  }

  getMutationFields(): ThunkObjMap<GraphQLFieldConfig<any, any, any>> {
    let field: ThunkObjMap<GraphQLFieldConfig<any, any, any>> = {};
    this.mutationRoutes.forEach((route) => {
      (field as any)[route.path] = this.compress(route);
    });
    return field;
  }

  getQueryFields(): ThunkObjMap<GraphQLFieldConfig<any, any, any>> {
    let field: ThunkObjMap<GraphQLFieldConfig<any, any, any>> = {};
    this.queryRoutes.forEach((route) => {
      (field as any)[route.path] = this.compress(route);
    });
    return field;
  }
}
