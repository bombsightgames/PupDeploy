angular.module('services', [])
    .service('UserService', function($rootScope, $http, $cookies, growl) {
        var service = {},
            socket = null;

        service.login = function(username, password) {
            return $http({
                method: 'POST',
                url: '/login',
                data: {
                    username: username,
                    password: password
                }
            }).then(function (res) {
                if (res.data.success) {
                    var token = res.data.token;
                    service.createSocket(token);
                    $cookies.put('pdtoken', token);
                } else {
                    growl.error(res.data.message);
                }
            }, function (err) {
                growl.error('Server error, failed to login.');
            });
        };

        service.createSocket = function(token) {
            socket = io('', {query: "token=" + token, reconnect: false});
            socket.on('connect', function() {
                if (!$cookies.get('pdtoken')) {
                    growl.success('Login successful.');
                }
                $rootScope.$emit('login');
            });
        };

        service.checkLoggedIn = function() {
            var token = $cookies.get('pdtoken');
            if (token) {
                service.createSocket(token);
            }

            return !token;
        };

        return service;
    });