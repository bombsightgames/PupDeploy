angular.module('services', [])
    .service('UserService', function($rootScope, $http, $cookies, $location, $timeout, growl) {
        var service = {};

        service.socket = null;

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
                console.error(err);
                growl.error('Server error, failed to login.');
            });
        };

        service.logout = function() {
            service.destroySocket();
            $cookies.remove('pdtoken');
            window.location.reload();
        };

        var conGrowl = null;
        service.createSocket = function(token) {
            function destroyConGrowl() {
                if (conGrowl) {
                    conGrowl.destroy();
                }
            }

            if (!service.socket) {
                var firstLogin = !$cookies.get('pdtoken');

                service.socket = io('', {query: "token=" + token, reconnection: true});
                service.socket.on('connect', function() {
                    if (firstLogin) {
                        firstLogin = false;
                        $location.path('/');
                        $rootScope.$apply();
                    }
                    $rootScope.$emit('login');
                });

                service.socket.on('connect_error', function(err) {
                    console.error(err);
                    growl.error('Failed to login.');
                });

                service.socket.on('connect_timeout', function() {
                    growl.error('Failed to login: Connection timeout.');
                });

                service.socket.on('reconnect', function() {
                    destroyConGrowl();
                    conGrowl = growl.success('Reconnected to server.');
                });

                service.socket.on('reconnect_error', function() {
                    destroyConGrowl();
                    conGrowl = growl.error('Failed to reconnect to server.');
                    $timeout(function() {
                        service.logout();
                    }, 3000);
                });

                service.socket.on('disconnect', function() {
                    destroyConGrowl();
                    conGrowl = growl.warning('Connection to server lost, attempting to reconnect.');
                });
            }
        };

        service.destroySocket = function() {
            service.socket.disconnect();
            service.socket = null;
        };

        service.isLoggedIn = function() {
            return !!$cookies.get('pdtoken');
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