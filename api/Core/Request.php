<?php

namespace Core;

class Request
{
    public string $method;
    public string $path;
    public array $query;

    public function __construct()
    {
        if (isset($_SERVER['REQUEST_METHOD'])) {
            $this->method = $_SERVER['REQUEST_METHOD'];
        } else {
            $this->method = 'GET';
        }

        
        
        if (isset($_GET['path'])) {
            $path = $_GET['path'];
            
            
            unset($_GET['path']);
        } else {
            
            if (isset($_SERVER['REQUEST_URI'])) {
                $uri = $_SERVER['REQUEST_URI'];
            } else {
                $uri = '/';
            }
            $path = parse_url($uri, PHP_URL_PATH);
            if (!$path) {
                $path = '/';
            }
            $path = preg_replace('#^/api#', '', $path);
        }
        $this->path = '/' . ltrim($path, '/');

        $this->query = $_GET;
    }

    public function query(string $key, ?string $default = null): ?string
    {
        if (isset($this->query[$key])) {
            return $this->query[$key];
        }
        return $default;
    }

    public function queryInt(string $key, ?int $default = null): ?int
    {
        if (!isset($this->query[$key]) || $this->query[$key] === '') {
            return $default;
        }
        return (int)$this->query[$key];
    }
}
