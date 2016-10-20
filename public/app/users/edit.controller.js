angular.module('app').controller('UsersEditController', function($rootScope, $scope, $location, growl, $routeParams, UserService) {
    var vm = this,
        id = $routeParams.id;

    vm.id = id;

    vm.save = function() {
        UserService.socket.emit('project_update', vm.project, function(err) {
            if (err) {
                growl.error(err);
            } else {
                if (id) {
                    growl.success('Project updated successfully.');
                } else {
                    growl.success('Project created successfully.');
                }

                $location.path('/projects');
            }
        });
    };

    $scope.$on('socket:slack_setup', function(event, data) {
        if (data.error) {
            growl.error(data.error);
        } else {
            console.log('Slack setup!', data);
            for (var i=0; i<vm.project.notifications.length; i++) {
                var notification = vm.project.notifications[i];
                if (data.token == notification.token) {
                    notification.slack = data.slack;
                    growl.success('Slack setup successfully!');
                    break;
                }
            }

            $scope.$apply();
        }
    });

    vm.authSlack = function(notification) {
        notification.token = Math.floor(Math.random()*100000000);

        var slackUrl = 'https://slack.com/oauth/authorize?scope=incoming-webhook&client_id=90733115808.92334895841&state=' + notification.token + '&redirect_uri=' + encodeURIComponent('http://pupdeploy.bombsightgames.com/api/' + window.location.protocol + '//' + window.location.host + '/slack');
        if (notification.token && slackUrl) {
            window.open(slackUrl, '_blank', 'width=600,height=500' + ', top=' + ((window.innerHeight - 500) / 2) + ', left=' + ((window.innerWidth - 600) / 2));
        }
    };

    vm.loading = true;
    if (id) {
        UserService.socket.emit('user_get', id, function(err, user) {
            if (err) {
                growl.error(err);
                $location.path('/users');
            } else {
                vm.user = user;
            }

            vm.loading = false;
            $rootScope.$apply();
        });
    } else {
        vm.user = {
            username: '',
            password: '',
            email: ''
        };

        vm.loading = false;
    }
});