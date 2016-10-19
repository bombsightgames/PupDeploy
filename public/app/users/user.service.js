angular.module('services', [])
    .service('UserService', function($rootScope, $route, $http, $cookies, $location, $timeout, growl) {
        var service = {};

        service.socket = null;
        service.userData = null;

        var loggingOut = false;
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
            loggingOut = true;
            service.destroySocket();
            $cookies.remove('pdtoken');
            window.location.reload();
        };

        var conGrowl = null,
            firstConnect = true;
        service.createSocket = function(token) {
            function destroyConGrowl() {
                if (conGrowl) {
                    conGrowl.destroy();
                }
            }

            if (!service.socket) {
                var firstLogin = !$cookies.get('pdtoken');

                service.socket = io('', {query: "token=" + token, reconnection: true});

                var onevent = service.socket.onevent;
                service.socket.onevent = function (packet) {
                    var args = packet.data || [];
                    onevent.call(this, packet);
                    packet.data = ["*"].concat(args);
                    onevent.call(this, packet);
                };

                service.socket.on('*', function(name, data) {
                    $rootScope.$emit('socket:' + name, data);
                    if ($route.current.scope) {
                        $route.current.scope.$emit('socket:' + name, data);
                    }
                });

                service.socket.on('connect', function() {
                    firstConnect = false;
                    if (firstLogin) {
                        firstLogin = false;
                        $location.path('/');
                        $rootScope.$apply();
                    }

                    $rootScope.$emit('login');

                    service.socket.once('user', function(data) {
                        service.userData = data;
                        $rootScope.$emit('userData');
                    });
                });

                service.socket.on('error', function(err) {
                    console.error(err);
                    
                    if (firstConnect) {
                        if (err === 'invalid_token') {
                            service.logout();
                        }
                    } else {
                        growl.error('Server error:', err);
                    }
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
                    if (!loggingOut) {
                        conGrowl = growl.warning('Connection to server lost, attempting to reconnect.');
                    }
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