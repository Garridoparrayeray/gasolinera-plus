<?php

namespace Core;

class Router
{
    private array $routes = [];

    public function get(string $pattern, callable $handler): void
    {
        $paramNames = [];
        $regex = preg_replace_callback('#\{(\w+)\}#', function ($m) use (&$paramNames) {
            $paramNames[] = $m[1];
            return '([^/]+)';
        }, $pattern);

        $this->routes[] = [
            'method' => 'GET',
            'regex' => '#^' . $regex . '$#',
            'params' => $paramNames,
            'handler' => $handler,
        ];
    }

    public function dispatch(Request $request): void
    {
        $matchedPath = false;
        foreach ($this->routes as $route) {
            if (!preg_match($route['regex'], $request->path, $matches)) {
                continue;
            }
            $matchedPath = true;
            if ($route['method'] !== $request->method) {
                continue;
            }
            array_shift($matches);
            $params = array_combine($route['params'], array_map('rawurldecode', $matches));
            try {
                ($route['handler'])($request, $params);
            } catch (\Throwable $e) {
                Response::internalError($e);
            }
            return;
        }

        if ($matchedPath) {
            Response::error('Method not allowed', 405);
        } else {
            Response::error('Not found', 404);
        }
    }
}
